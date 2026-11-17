import type { ReviewOrder,ReviewRecord,ReviewWorkspace } from './types'
/** Replacement exclusion is sticky and transitive. No buyer identifiers or unrelated customer matching. */
export function replacementExclusions(orders:readonly ReviewOrder[],previous:Pick<ReviewWorkspace,'links'|'blocked'>){
  const links={...previous.links},blocked={...previous.blocked}
  for(const order of orders){if(order.replacement===true)blocked[order.id]=true;if(order.replaces){links[order.id]=order.replaces;blocked[order.id]=true;blocked[order.replaces]=true}}
  let changed=true;while(changed){changed=false;for(const [child,parent]of Object.entries(links))if(blocked[child]||blocked[parent]){if(!blocked[child]||!blocked[parent])changed=true;blocked[child]=true;blocked[parent]=true}}
  return {links,blocked}
}
export function reviewControl(record:ReviewRecord|undefined,excluded:boolean,order?:ReviewOrder):{label:'Waiting'|'Send request'|'Request sent';sendable:boolean;reason:string}{
  if(record?.state==='sent')return {label:'Request sent',sendable:false,reason:`${record.source==='seller-central-confirmed'?'Confirmed by you as requested in Seller Central':'Accepted by Amazon'}${record.sentAt?` · ${record.sentAt}`:''}${excluded?' · Replacement chain now excluded':''}`}
  if(excluded)return {label:'Waiting',sendable:false,reason:'Replacement chain excluded: no automatic or manual review request.'}
  if(order&&!reviewPrerequisite(order).ready)return {label:'Waiting',sendable:false,reason:reviewPrerequisite(order).reason}
  if(record?.state==='eligible')return {label:'Send request',sendable:true,reason:'Eligibility will be checked again before submitting.'}
  return {label:'Waiting',sendable:false,reason:record?.reason??'Eligibility has not been checked yet.'}
}
/** These are scheduling prerequisites; only the marketplace API grants request eligibility. */
export function reviewPrerequisite(order:ReviewOrder):{ready:boolean;reason:string}{
  if(['Canceled','Pending','PendingAvailability','Unshipped'].includes(order.status??''))return {ready:false,reason:'Awaiting shipment; review checking has not started.'}
  if(order.fulfillment==='seller')return order.deliveryConfirmed===true||order.status==='Delivered'
    ?{ready:true,reason:'Delivery confirmed.'}:{ready:false,reason:'Awaiting confirmed delivery. An estimated delivery date is not delivery confirmation.'}
  if(order.fulfillment==='marketplace')return ['Shipped','Delivered'].includes(order.status??'')&&order.paymentReleased===true
    ?{ready:true,reason:'Seller payment released.'}:{ready:false,reason:'Awaiting released seller payment.'}
  return {ready:false,reason:'Fulfilment method is unconfirmed.'}
}
/** Eligibility comes from the API; age/delivery metadata only schedules checks, never grants eligibility. */
export function reviewCandidates(orders:readonly ReviewOrder[],state:ReviewWorkspace,now:string,limit=2,dueOnly=true):ReviewOrder[]{
  const time=Date.parse(now)
  return orders.filter(order=>{
    const record=state.records[order.id],age=time-Date.parse(order.purchased)
    if(state.blocked[order.id]||['sent','sending','uncertain','expired'].includes(record?.state??'')||!reviewPrerequisite(order).ready)return false
    if(!Number.isFinite(age)||age<5*86400000||age>(order.latestDelivery?120:45)*86400000)return false
    return !dueOnly||!record?.nextCheck||Date.parse(record.nextCheck)<=time
  }).sort((a,b)=>a.purchased.localeCompare(b.purchased)||a.id.localeCompare(b.id)).slice(0,limit)
}

/** Keep sent/ambiguous dispatch history visible, while hiding orders not ready for checking. */
export function reviewListOrder(order:ReviewOrder,record:ReviewRecord|undefined):boolean {
  return ['sent','sending','uncertain'].includes(record?.state??'')||reviewPrerequisite(order).ready
}

/** Fill missing delivery evidence from read-only per-order verification, never overwrite explicit tracking. */
export function resolvedReviewOrders(orders:readonly ReviewOrder[],state:ReviewWorkspace):ReviewOrder[]{
 return orders.map(order=>({...order,deliveryConfirmed:order.deliveryConfirmed??state.verified[order.id]?.deliveryConfirmed}))
}
/** Tracking discovery is separate from solicitation checking and never sends a request. */
export function deliveryCandidates(orders:readonly ReviewOrder[],state:ReviewWorkspace,now:string,limit=2):ReviewOrder[]{
 const time=Date.parse(now)
 return orders.filter(order=>{
  const age=time-Date.parse(order.purchased),checked=Date.parse(state.verified[order.id]?.verifiedAt??'')
  return order.fulfillment==='seller'&&order.status==='Shipped'&&order.deliveryConfirmed!==true
   &&!state.blocked[order.id]&&!['sent','sending','uncertain','expired'].includes(state.records[order.id]?.state??'')
   &&Number.isFinite(age)&&age>=5*86400000&&age<=45*86400000&&(!Number.isFinite(checked)||time-checked>=12*3600000)
 }).sort((a,b)=>b.purchased.localeCompare(a.purchased)).slice(0,limit)
}
