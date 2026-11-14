import {androidDevice,desktopDevice} from '../device/bridge'
import {nativeReviewTransport} from './native'
import {hostedReviewAction} from '../amazon-hosted/client'
import type {ReviewOrder} from '../../core/review-requests/types'
import type {ReviewTransport} from './transport'
export function reviewClient(account:string):ReviewTransport{
  if(androidDevice)return nativeReviewTransport
  async function call(action:string,id:string,signal:AbortSignal,attemptId?:string):Promise<Record<string,unknown>>{
    if(!desktopDevice)return hostedReviewAction(account,action==='order'?'reviewOrder':action==='eligibility'?'reviewEligibility':'reviewSubmit',{orderId:id,attemptId},signal)
    const response=await fetch('/api/reviews/action',{method:'POST',signal,headers:{'Content-Type':'application/json','X-Azulia-Intent':'review-request'},body:JSON.stringify({account,action,orderId:id,attemptId})}),value=await response.json()
    if(!response.ok)throw new Error(value.error??'Review action was not confirmed.');return value
  }
  return {order:async(id,signal)=>await call('order',id,signal) as unknown as ReviewOrder,eligible:async(id,signal)=>(await call('eligibility',id,signal)).eligible===true,submit:async(id,attemptId,signal)=>{const result=await call('submit',id,signal,attemptId);if(result.accepted!==true)throw new Error('Submission was not confirmed.')}}
}
