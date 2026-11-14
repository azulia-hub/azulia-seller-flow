import type { PilotCredentials } from '../amazon-api/authorization.ts'
import { sourceAccessToken,SourceError } from '../amazon-api/reader.ts'
import { createOrderDateReader } from '../amazon-api/orders.ts'
import { reviewOrders } from './orders.ts'
import type { ReviewOrder } from '../../core/review-requests/types'
export interface ReviewTransport {order:(id:string,signal:AbortSignal)=>Promise<ReviewOrder>;eligible:(id:string,signal:AbortSignal)=>Promise<boolean>;submit:(id:string,attemptId:string,signal:AbortSignal)=>Promise<void>}
export function createReviewTransport(credentials:PilotCredentials,request:typeof fetch=fetch,sessionToken?:string):ReviewTransport{
  let token=sessionToken??'',until=sessionToken?Infinity:0
  const orders=createOrderDateReader(credentials,request,sessionToken)
  async function call(id:string,method:'GET'|'POST',signal:AbortSignal,attemptId?:string){
    if(!/^[A-Z0-9]{3}-\d{7}-\d{7}$/.test(id))throw new SourceError('Invalid order reference.',3600,400)
    if(!token||Date.now()>=until){token=await sourceAccessToken(credentials,request);until=Date.now()+45*60000}
    const url=new URL(`https://sellingpartnerapi-eu.amazon.com/solicitations/v1/orders/${id}${method==='POST'?'/solicitations/productReviewAndSellerFeedback':''}`)
    url.searchParams.set('marketplaceIds','A21TJRUUN4KGV')
    const response=await request(url,{method,redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(15000)]),headers:{'x-amz-access-token':token,'User-Agent':'Azulia/0.3',...(attemptId?{'X-Azulia-Review-Attempt':attemptId}:{})}})
    if(!response.ok){await response.body?.cancel();if(response.status===401){token='';until=0}throw new SourceError(response.status===403?'Review-request permission is unavailable.':`Amazon did not confirm this review action (${response.status}).`,Math.max(response.status===403?3600:60,Number(response.headers.get('retry-after'))||60),response.status)}
    if(method==='POST'){await response.body?.cancel();if(response.status!==201)throw new SourceError('Amazon did not return a confirmed created response. Do not resend without checking.',3600,response.status);return {}}
    const raw=await response.text();if(raw.length>256*1024)throw new SourceError('Eligibility response exceeds the supported size.')
    const value:unknown=JSON.parse(raw);if(!value||typeof value!=='object')throw new SourceError('Unrecognized eligibility response.')
    return value as Record<string,unknown>
  }
  return {
    async order(id,signal){const value=await orders.one(id,signal);if(!value.summary)throw new SourceError('Order metadata is unavailable.');return {...reviewOrders([value.summary])[0],verifiedAt:new Date().toISOString()}},
    async eligible(id,signal){const value=await call(id,'GET',signal),links=value._links as Record<string,unknown>|undefined;const actions=links?.actions;if(!Array.isArray(actions))throw new SourceError('Eligibility actions are missing; no request was sent.');return actions.some(action=>action&&typeof action==='object'&&action.name==='productReviewAndSellerFeedback')},
    async submit(id,attemptId,signal){await call(id,'POST',signal,attemptId)},
  }
}
