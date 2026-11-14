import { initialReviews,initialReviewSettings,type ReviewWorkspace,type ReviewSettings,type ReviewOrder,type ReviewRecord } from '../../core/review-requests/types'
import { replacementExclusions,reviewCandidates } from '../../core/review-requests/planner'
import type { ReviewTransport } from './transport'
import type { InventoryStorage } from '../amazon-inventory/workspaceTypes'
export interface ReviewContext {account:string;orders:readonly ReviewOrder[];freshOrdersAt:string|null}
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))
async function mutate(storage:InventoryStorage,account:string,fn:(value:ReviewWorkspace)=>void){
  for(let i=0;i<4;i++){const entry=await storage.get<ReviewWorkspace>(`reviews:${account}`),value=entry.value??initialReviews(account);if(value.account!==account)throw new Error('Review workspace account mismatch.');const before=JSON.stringify(value);fn(value);if(entry.value&&JSON.stringify(value)===before)return value;try{await storage.put(`reviews:${account}`,value,entry.version);return value}catch(cause){if((cause as {status?:number})?.status!==409||i===3)throw cause}}
  throw new Error('Review state changed elsewhere. Try again.')
}
export async function mergeReviewOrders(storage:InventoryStorage,context:ReviewContext){return mutate(storage,context.account,state=>{const result=replacementExclusions([...context.orders,...Object.values(state.verified)],state);state.links=result.links;state.blocked=result.blocked;for(const record of Object.values(state.records))if(record.state==='sending'&&record.attemptAt&&Date.now()-Date.parse(record.attemptAt)>10*60000){record.state='uncertain';record.reason='An interrupted submission has no confirmed outcome. Verify in Seller Central before any further action.'}})}
async function verify(storage:InventoryStorage,context:ReviewContext,id:string,transport:ReviewTransport,signal:AbortSignal){
  const order=await transport.order(id,signal)
  if(order.id!==id)throw new Error('Amazon returned a different order. No request was sent.')
  const state=await mutate(storage,context.account,value=>{value.verified[id]=order;const blocked=replacementExclusions([...context.orders,...Object.values(value.verified)],value);value.links=blocked.links;value.blocked=blocked.blocked})
  if(state.blocked[id])throw new Error('Replacement chain excluded. No review request will be sent.')
  if(!['Shipped','Delivered'].includes(order.status??''))throw new Error('The order is not confirmed shipped. No request will be sent yet.')
  if(order.replacement!==false)throw new Error('Replacement metadata is unconfirmed. No request will be sent yet.')
  return order
}
export async function checkReview(storage:InventoryStorage,context:ReviewContext,id:string,transport:ReviewTransport,signal:AbortSignal){
  let record:ReviewRecord
  const now=new Date().toISOString()
  const current=await mergeReviewOrders(storage,context),old=current.records[id]
  if(old&&['sent','sending','uncertain','expired'].includes(old.state))return current
  if(current.blocked[id])return current
  try{
    const order=await verify(storage,context,id,transport,signal)
    const deadline=order.latestDelivery?Date.parse(order.latestDelivery)+30*86400000:NaN
    if(Number.isFinite(deadline)&&Date.now()>deadline)record={orderId:id,state:'expired',reason:'The delivery-based request window has ended.',nextCheck:null,checkedAt:now}
    else{const eligible=await transport.eligible(id,signal);record={orderId:id,state:eligible?'eligible':'waiting',reason:eligible?'Available through Amazon.':'Amazon has not made the request action available. This does not establish whether Seller Central already sent one.',checkedAt:now,nextCheck:new Date(Date.now()+12*3600000).toISOString()}}
  }catch(cause){record={orderId:id,state:'waiting',reason:cause instanceof Error?cause.message:'Eligibility check failed. No request was sent.',checkedAt:now,nextCheck:new Date(Date.now()+Math.max(3600,Number((cause as {retryAfter?:number})?.retryAfter)||3600)*1000).toISOString()}}
  return mutate(storage,context.account,value=>{if(!['sent','sending','uncertain','expired'].includes(value.records[id]?.state??''))value.records[id]=record})
}
/** Claim is durable before POST. A crash/timeout never automatically replays an ambiguous submission. */
export async function sendReview(storage:InventoryStorage,context:ReviewContext,id:string,transport:ReviewTransport,source:'manual'|'automatic',signal:AbortSignal,preChecked?:ReviewWorkspace){
  const freshTime = context.freshOrdersAt ? Date.parse(context.freshOrdersAt) : NaN
  if (!Number.isFinite(freshTime) || Date.now() - freshTime > 5 * 60000) {
    throw new Error('Refresh recent orders before sending, so known replacement orders can be excluded.')
  }
  const checked = preChecked && preChecked.account === context.account ? preChecked : await checkReview(storage, context, id, transport, signal)
  if (checked.blocked[id]) throw new Error('Replacement chain excluded. No review request will be sent.')
  if (checked.records[id]?.state !== 'eligible') throw new Error(checked.records[id]?.reason ?? 'This order is not available for a review request.')
  if (source === 'automatic') {
    const config = (await storage.get<ReviewSettings>(`reviews-config:${context.account}`)).value
    if (!config?.autoEnabled) throw new Error('Automatic sending is off.')
  }
  if (signal.aborted) throw new DOMException('Submission stopped before claim.', 'AbortError')

  const attemptId = crypto.randomUUID(), at = new Date().toISOString()
  await mutate(storage, context.account, value => {
    if (value.blocked[id] || value.records[id]?.state !== 'eligible') throw new Error('This request was already claimed or excluded.')
    value.records[id] = { ...value.records[id], state: 'sending', source, attemptId, attemptAt: at, reason: 'Submission is in progress. It will not be sent again automatically.', nextCheck: null }
  })

  let dispatched = false
  try {
    if (signal.aborted) throw new DOMException('Submission stopped before dispatch.', 'AbortError')
    const currentReviews = (await storage.get<ReviewWorkspace>(`reviews:${context.account}`)).value
    if (currentReviews?.blocked[id]) throw new Error('Replacement chain was excluded before submission.')
    if (source === 'automatic' && !(await storage.get<ReviewSettings>(`reviews-config:${context.account}`)).value?.autoEnabled) {
      throw new Error('Automatic sending was disabled before submission.')
    }
    await storage.put(`review-attempt:${context.account}:${id}`, { attemptId, orderId: id, source, state: 'prepared', at }, 0)
    dispatched = true
    await transport.submit(id, attemptId, signal)
  } catch (cause) {
    if (!dispatched) {
      await mutate(storage, context.account, value => {
        if (value.records[id]?.attemptId === attemptId && value.records[id]?.state === 'sending') {
          value.records[id] = {
            ...value.records[id],
            state: value.blocked[id] ? 'waiting' : 'eligible',
            reason: cause instanceof Error ? cause.message : 'Preparation interrupted before submission. No request was dispatched.',
            attemptId: undefined,
            attemptAt: undefined,
          }
        }
      })
      throw cause
    }
    await mutate(storage, context.account, value => {
      if (value.records[id]?.attemptId === attemptId) {
        value.records[id] = { ...value.records[id], state: 'uncertain', reason: 'Amazon acceptance was not confirmed. Do not resend blindly; verify in Seller Central.', nextCheck: null }
      }
    })
    throw cause
  }
  return mutate(storage, context.account, value => {
    if (value.records[id]?.attemptId !== attemptId) throw new Error('A newer review record exists.')
    value.records[id] = { ...value.records[id], state: 'sent', sentAt: new Date().toISOString(), reason: 'Amazon accepted the standard review and seller-feedback request.', nextCheck: null }
  })
}
export async function runReviewCycle(storage:InventoryStorage,context:ReviewContext,transport:ReviewTransport){
  const merged=await mergeReviewOrders(storage,context)
  const candidates=reviewCandidates(context.orders,merged,new Date().toISOString(),2)
  const deadline=Date.now()+12000
  const abort=AbortSignal.timeout(12000)
  for(const order of candidates){
    if(abort.aborted||Date.now()+2500>=deadline)break
    try{
      const checked=await checkReview(storage,context,order.id,transport,abort)
      const config=(await storage.get<ReviewSettings>(`reviews-config:${context.account}`)).value??initialReviewSettings()
      if(config.autoEnabled&&checked.records[order.id]?.state==='eligible'){
        if(Date.now()+2000>=deadline)break
        await sendReview(storage,context,order.id,transport,'automatic',abort,checked)
      }
    }catch{/* Status is retained; optional review work must not fail financial sync. */}
    await pause(1100)
  }
}
