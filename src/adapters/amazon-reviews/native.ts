import { nativeRequest } from '../device/bridge'
import { createReviewTransport } from './transport'
const nativeFetch:typeof fetch=async(input,init)=>{
  const url=String(input),method=init?.method??'GET'
  if(init?.signal?.aborted)throw new DOMException('Stopped','AbortError')
  const result=method==='POST'?await nativeRequest<{status:number;body:string;retryAfter:string}>('reviews.submit',{orderId:new URL(url).pathname.split('/')[4],attemptId:new Headers(init?.headers).get('X-Azulia-Review-Attempt')}):await nativeRequest<{status:number;body:string;retryAfter:string}>('amazon.request',{url})
  if(init?.signal?.aborted)throw new DOMException('Stopped','AbortError')
  return new Response(result.body,{status:result.status,headers:{'Content-Type':'application/json','Retry-After':result.retryAfter??'60'}})
}
export const nativeReviewTransport=createReviewTransport({},nativeFetch,'native-managed')
