import type { ReviewOrder,ReviewRecord,ReviewWorkspace } from './types'
/** Replacement exclusion is sticky and transitive. No buyer identifiers or unrelated customer matching. */
export function replacementExclusions(orders:readonly ReviewOrder[],previous:Pick<ReviewWorkspace,'links'|'blocked'>){
  const links={...previous.links},blocked={...previous.blocked}
  for(const order of orders){if(order.replacement===true)blocked[order.id]=true;if(order.replaces){links[order.id]=order.replaces;blocked[order.id]=true;blocked[order.replaces]=true}}
  let changed=true;while(changed){changed=false;for(const [child,parent]of Object.entries(links))if(blocked[child]||blocked[parent]){if(!blocked[child]||!blocked[parent])changed=true;blocked[child]=true;blocked[parent]=true}}
  return {links,blocked}
}
export function reviewControl(record:ReviewRecord|undefined,excluded:boolean):{label:'Waiting'|'Send request'|'Request sent';sendable:boolean;reason:string}{
  if(record?.state==='sent')return {label:'Request sent',sendable:false,reason:`${record.source==='seller-central-confirmed'?'Confirmed by you as requested in Seller Central':'Accepted by Amazon'}${record.sentAt?` · ${record.sentAt}`:''}${excluded?' · Replacement chain now excluded':''}`}
  if(excluded)return {label:'Waiting',sendable:false,reason:'Replacement chain excluded: no automatic or manual review request.'}
  if(record?.state==='eligible')return {label:'Send request',sendable:true,reason:'Eligibility will be checked again before submitting.'}
  return {label:'Waiting',sendable:false,reason:record?.reason??'Eligibility has not been checked yet.'}
}
/** Eligibility comes from the API; age/delivery metadata only schedules checks, never grants eligibility. */
export function reviewCandidates(orders:readonly ReviewOrder[],state:ReviewWorkspace,now:string,limit=2):ReviewOrder[]{
  const time=Date.parse(now)
  return orders.filter(order=>{
    const record=state.records[order.id],age=time-Date.parse(order.purchased)
    if(state.blocked[order.id]||['sent','sending','uncertain','expired'].includes(record?.state??'')||['Canceled','Pending','PendingAvailability','Unshipped'].includes(order.status??''))return false
    if(!Number.isFinite(age)||age<5*86400000||age>(order.latestDelivery?120:45)*86400000)return false
    return !record?.nextCheck||Date.parse(record.nextCheck)<=time
  }).sort((a,b)=>a.purchased.localeCompare(b.purchased)||a.id.localeCompare(b.id)).slice(0,limit)
}
