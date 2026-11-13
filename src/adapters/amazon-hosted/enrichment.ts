import type { SourceOrderSummary } from '../amazon-report-sync/protocol'
import type { BrowserJob, CacheMeta, CatalogValue } from './cacheTypes'
import type { SyncRunTracker } from '../../core/sync/planner'

/** Metadata requests must not wait for historical finance/date completion. */
export function enrichmentTargets(orders: readonly SourceOrderSummary[], catalog: readonly CatalogValue[], state: CacheMeta, tracker: SyncRunTracker, priority: ReadonlySet<string>, now: number) {
  const recent = [...orders].sort((a,b) => Number(priority.has(b.id))-Number(priority.has(a.id)) || Number(a.status?.toLowerCase()==='canceled')-Number(b.status?.toLowerCase()==='canceled') || b.purchased.localeCompare(a.purchased) || a.id.localeCompare(b.id))
  const items = recent.filter(order => (!order.asin || !order.title || !order.items?.length)
    && tracker.canEnqueue('orderItems',order.id)
    && now-(state.orderItemsChecked?.[order.id]??0)>60000)
  const asins = [...new Set(recent.flatMap(order => [order.asin,...(order.items??[]).map(item=>item.asin)]).filter((asin):asin is string => Boolean(asin && /^[A-Z0-9]{10}$/.test(asin))))]
  const known = new Map(catalog.map(item=>[item.asin,item]))
  const products = state.catalogError ? [] : asins.filter(asin => tracker.canEnqueue('catalog',asin) && now-(state.catalogChecked[asin]??0)>(known.get(asin)?.imageUrl?7*86400000:60000))
  return { items, asins: products }
}

/** Reserve periodic ready slots for enrichment while honoring per-operation cooldowns. */
export function pickSyncJob(jobs: readonly BrowserJob[], next: Readonly<Record<string,number>>, completed: number, priority: ReadonlySet<string>, now: number): BrowserJob {
  const allowance=(job:BrowserJob)=>next[job.kind==='history'?'finance':job.kind]??0
  const ready=jobs.filter(job=>allowance(job)<=now)
  if(!ready.length)return [...jobs].sort((a,b)=>allowance(a)-allowance(b))[0]
  const metadata=ready.filter(job=>job.kind==='orderItems'||job.kind==='catalog')
  const visible=metadata.find(job=>job.orderId && priority.has(job.orderId))
  if(visible && completed%2===0)return visible
  if(metadata.length && completed%4===0)return metadata[0]
  return ready[0]
}
