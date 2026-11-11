import type { BrowserJob, CacheMeta, CatalogValue } from '../../src/adapters/amazon-shared/contracts'
import type { SourceOrderSummary } from '../../src/adapters/amazon-report-sync/protocol'
import { text } from '../../src/adapters/amazon-report-sync/money'
import { sameContent } from '../../src/core/sync/sameContent'
import { mergeCoverage } from '../../src/core/sync/ranges'
import { SharedError, type Account } from './store'

export interface SourcePage {
  records?: Record<string, unknown>[]; orders?: SourceOrderSummary[]; issues?: string[]
  nextToken: string | null; catalog?: CatalogValue; orderItems?: NonNullable<SourceOrderSummary['items']>
}
export function requireLease(metadata: CacheMeta, owner: string, now: number) {
  if (metadata.leaseOwner !== owner || (metadata.leaseUntil ?? 0) <= now) throw new SharedError('The shared sync lock expired. Resume from its saved checkpoint.', 409)
}
/** Pure page reducer. The database commits its writes and metadata in one transaction. */
export function preparePage(account: Account, owner: string, job: BrowserJob, page: SourcePage, now: number) {
  const metadata = structuredClone(account.meta)
  requireLease(metadata, owner, now)
  const current = metadata.jobs.find(value => value.id === job.id)
  if (!current || !sameContent(current, job)) throw new SharedError('This page has already advanced. Resume the saved checkpoint.', 409)
  if (page.nextToken && page.nextToken === job.nextToken) throw new SharedError('Amazon repeated a pagination token. The checkpoint has not advanced.', 502)
  const writes: { kind: string; id: string; value: unknown }[] = []
  const put = (kind: string, id: string, old: unknown, value: unknown) => {
    if (!sameContent(old, value)) writes.push({kind,id,value})
  }
  const orders = new Map(account.orders.map(value => [value.id,value]))
  const records = new Map(account.records.map(value => [text(value.transactionId),value]))
  for (const record of page.records ?? []) {
    const id = text(record.transactionId)
    if (!id || !Number.isFinite(Date.parse(text(record.postedDate)))) throw new SharedError('Unsupported financial identity or date. Raw page was not acknowledged.', 422)
    put('records',id,records.get(id),record)
  }
  for (const order of page.orders ?? []) {
    if (!/^[A-Z0-9]{3}-\d{7}-\d{7}$/.test(order.id) || !Number.isFinite(Date.parse(order.purchased))) throw new SharedError('Unsupported order identity or date.',422)
    const old = orders.get(order.id)
    const value = { ...old, ...order, purchased: new Date(order.purchased).toISOString(), items: order.items ?? old?.items, sku: order.sku ?? old?.sku ?? null, asin: order.asin ?? old?.asin ?? null, title: order.title ?? old?.title ?? null, imageUrl: order.imageUrl ?? old?.imageUrl ?? null }
    put('orders',order.id,old,value); orders.set(order.id,value); metadata.orderChecked[order.id] = now
  }
  if (page.orderItems && job.orderId) {
    const old = orders.get(job.orderId)
    if (!old) throw new SharedError('Fetch the order before its items.',409)
    // Store partial pages in the job, not in the published order. ItemPrice is a line total.
    const pending = (current as BrowserJob & { pendingItems?: SourceOrderSummary['items'] }).pendingItems ?? []
    const items = [...pending,...page.orderItems]
    if (page.nextToken) (current as BrowserJob & { pendingItems?: SourceOrderSummary['items'] }).pendingItems = items
    else {
      const first = items[0]
      // ItemPrice excludes shipping/gift wrap. It must not masquerade as OrderTotal.
      const value = { ...old, items, sku: first?.sku ?? old.sku, asin: first?.asin ?? old.asin, title: first?.title ?? old.title }
      put('orders',job.orderId,old,value)
      metadata.orderItemsChecked ??= {}; metadata.orderItemsChecked[job.orderId] = now
    }
  }
  if (page.catalog) {
    const catalog = page.catalog
    put('catalog',catalog.asin,account.catalog.find(value => value.asin === catalog.asin),catalog)
    metadata.catalogChecked[catalog.asin] = now
  }
  if (page.issues?.length) {
    const previous = metadata.issues.length
    metadata.issues = [...new Set([...metadata.issues,...page.issues])]
    metadata.orderDateIssues += metadata.issues.length - previous
  }
  if (page.nextToken) current.nextToken = page.nextToken
  else {
    metadata.jobs = metadata.jobs.filter(value => value.id !== job.id)
    if (job.kind === 'finance') metadata.coverage = mergeCoverage([...metadata.coverage,{from:job.from,to:job.to}])
    if (job.kind === 'purchases') metadata.purchaseCoverage = mergeCoverage([...metadata.purchaseCoverage,{from:job.from,to:job.to}])
    if (job.kind === 'history' && job.orderId) metadata.historyChecked[job.orderId] = now
  }
  if (writes.length || metadata.revision === 0 && !page.nextToken) { metadata.revision++; metadata.updatedAt = new Date(now).toISOString() }
  metadata.lastSync = new Date(now).toISOString(); metadata.leaseUntil = now + 120000
  return { metadata, writes }
}
