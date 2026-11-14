import './reviews.css'
import {createContext,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react'
import {androidDevice,nativeRequest} from '../../adapters/device/bridge'
import {inventoryStorage,inventoryVersion} from '../../adapters/amazon-inventory/storage'
import {checkReview,sendReview,mergeReviewOrders,type ReviewContext as ActionContext} from '../../adapters/amazon-reviews/service'
import {reviewOrders,sourceReviewOrders} from '../../adapters/amazon-reviews/orders'
import {reviewClient} from '../../adapters/amazon-reviews/client'
import type {SourceOrderSummary} from '../../adapters/amazon-report-sync/protocol'
import {initialReviewSettings,initialReviews,type ReviewWorkspace,type ReviewSettings} from '../../core/review-requests/types'
import {replacementExclusions} from '../../core/review-requests/planner'
interface Value {orders:readonly SourceOrderSummary[];account:string|null;state:ReviewWorkspace|null;settings:ReviewSettings;busy:string|null;message:string;act:(id:string,send:boolean)=>Promise<void>;configure:(enabled:boolean)=>Promise<void>;markExternal:(id:string)=>Promise<void>}
const Context=createContext<Value|null>(null)
export const useReviews=()=>useContext(Context)
export function ReviewProvider({account,orders:canonicalOrders,freshOrdersAt,children}:{account:string|null;orders:readonly import('../../core/data/types').CanonicalOrder[];freshOrdersAt:string|null;children:ReactNode}){
  const orders=useMemo(()=>sourceReviewOrders(canonicalOrders),[canonicalOrders])
  const [state,setState]=useState<ReviewWorkspace|null>(null),[settings,setSettings]=useState<ReviewSettings>(initialReviewSettings),[busy,setBusy]=useState<string|null>(null),[message,setMessage]=useState('')
  const current=useRef({account,orders,freshOrdersAt});current.current={account,orders,freshOrdersAt}
  const running=useRef(false)
  const version=useRef({state:-1,config:-1})
  useEffect(()=>{let alive=true,loading=false;version.current={state:-1,config:-1};setState(null);setBusy(null);setSettings(initialReviewSettings());setMessage('');if(!account)return
    const load=async()=>{if(loading)return;loading=true;try{
      const [head,config]=await Promise.all([inventoryVersion(`reviews:${account}`),inventoryVersion(`reviews-config:${account}`)])
      if(!alive)return
      if(head>version.current.state){const entry=await inventoryStorage.get<ReviewWorkspace>(`reviews:${account}`);if(alive&&entry.version>version.current.state){version.current.state=entry.version;setState(entry.value)}}
      if(config>version.current.config){const entry=await inventoryStorage.get<ReviewSettings>(`reviews-config:${account}`);if(alive&&entry.version>version.current.config){version.current.config=entry.version;setSettings(entry.value??initialReviewSettings())}}
    }catch{if(alive)setMessage('Review state could not be read. No request has been sent by this action.')}finally{loading=false}}
    void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load()},5000);return()=>{alive=false;clearInterval(timer)}
  },[account])
  useEffect(()=>{if(!message)return;const timer=setTimeout(()=>setMessage(''),10000);return()=>clearTimeout(timer)},[message])
  const visible=useMemo(()=>{if(!account)return null;const value=state??initialReviews(account);return {...value,...replacementExclusions(reviewOrders(orders),value)}},[account,state,orders])
  const context=async(expectedAccount:string):Promise<ActionContext>=>{
    if(!expectedAccount||current.current.account!==expectedAccount)throw new Error('Account switched during review action. Action cancelled.')
    let fresh=current.current.freshOrdersAt
    if(androidDevice)fresh=(await nativeRequest<{ordersCheckedAt?:string}>('sync.status')).ordersCheckedAt??null
    if(current.current.account!==expectedAccount)throw new Error('Account switched during review action. Action cancelled.')
    return {account:expectedAccount,orders:reviewOrders(current.current.orders),freshOrdersAt:fresh}
  }
  async function act(id:string,send:boolean){
    const owner=account??current.current.account
    if(!owner)throw new Error('Connect Amazon first.')
    if(running.current)throw new Error('Another review action is in progress.')
    running.current=true;setBusy(id);setMessage('')
    try{
      const value=await context(owner)
      const result=send?await sendReview(inventoryStorage,value,id,reviewClient(value.account),'manual',AbortSignal.timeout(45000)):await checkReview(inventoryStorage,value,id,reviewClient(value.account),AbortSignal.timeout(45000))
      if(current.current.account===owner){setState(result);setMessage(send?'Amazon accepted the request.':'Eligibility updated.')}
    }catch(cause){
      if(current.current.account===owner)setMessage(cause instanceof Error?cause.message:'Request outcome was not confirmed.')
      throw cause
    }finally{
      running.current=false;if(current.current.account===owner)setBusy(null)
    }
  }
  async function configure(enabled:boolean){
    const owner=account??current.current.account
    if(!owner)throw new Error('Connect Amazon first.')
    const entry=await inventoryStorage.get<ReviewSettings>(`reviews-config:${owner}`)
    const next={schema:1 as const,autoEnabled:enabled,enabledAt:enabled?new Date().toISOString():entry.value?.enabledAt??null}
    await inventoryStorage.put(`reviews-config:${owner}`,next,entry.version)
    if(current.current.account===owner)setSettings(next)
  }
  async function markExternal(id:string){
    const owner=account??current.current.account
    if(!owner)throw new Error('Connect Amazon first.')
    await context(owner)
    for(let attempt=0;attempt<3;attempt++){
      if(current.current.account!==owner)throw new Error('Account switched during action. Action cancelled.')
      const entry=await inventoryStorage.get<ReviewWorkspace>(`reviews:${owner}`)
      const next=entry.value??initialReviews(owner)
      if(next.records[id]?.state==='sending')throw new Error('A submission is still in progress. Wait for its outcome.')
      next.records[id]={orderId:id,state:'sent',source:'seller-central-confirmed',sentAt:new Date().toISOString(),reason:'Confirmed by you as requested in Seller Central; not independently verified.',checkedAt:null,nextCheck:null}
      try{
        await inventoryStorage.put(`reviews:${owner}`,next,entry.version)
        if(current.current.account===owner)setState(next)
        return
      }catch(cause){
        if((cause as {status?:number})?.status!==409||attempt===2)throw cause
      }
    }
  }
  useEffect(()=>{if(!account)return;void mergeReviewOrders(inventoryStorage,{account,orders:reviewOrders(orders),freshOrdersAt}).catch(()=>{})},[account,orders,freshOrdersAt])
  return <Context.Provider value={{orders,account,state:visible,settings,busy,message,act,configure,markExternal}}>{children}{message?<div className="review-action-notice" role="status">{message}</div>:null}</Context.Provider>
}
