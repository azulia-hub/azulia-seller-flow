import type { SyncSnapshot, SourceOrderSummary } from '../amazon-report-sync/protocol'
import type { CacheMeta, CatalogValue } from './contracts'
import { object, text } from '../amazon-report-sync/money'

export interface SharedCache { meta: CacheMeta; records: Record<string, unknown>[]; orders: SourceOrderSummary[]; catalog: CatalogValue[] }
export function sourceSnapshot(account: string, cache: SharedCache): SyncSnapshot {
  const orders = new Map(cache.orders.map(order => [order.id, order])), catalog = new Map(cache.catalog.map(item => [item.asin, item]))
  const records = cache.records.map((record): Record<string, unknown> => {
    const ids = [...new Set((Array.isArray(record.relatedIdentifiers) ? record.relatedIdentifiers : []).map(object).filter(row => row.relatedIdentifierName === 'ORDER_ID').map(row => text(row.relatedIdentifierValue)).filter(Boolean))]
    const asins = [...new Set((Array.isArray(record.items) ? record.items : []).map(object).flatMap(item => (Array.isArray(item.contexts) ? item.contexts : []).map(object).map(context => text(context.asin))).filter(Boolean))]
    return { ...record, azuliaOrderPurchaseDate: ids.length === 1 ? orders.get(ids[0])?.purchased ?? null : null, azuliaCatalogImages: Object.fromEntries(asins.map(asin => [asin, catalog.get(asin)?.imageUrl ?? null])), azuliaCatalogTitles: Object.fromEntries(asins.map(asin => [asin, catalog.get(asin)?.title ?? null])) }
  }).sort((a, b) => text(a.postedDate).localeCompare(text(b.postedDate)) || text(a.transactionId).localeCompare(text(b.transactionId)))
  const enrichedOrders = cache.orders.map(order => {
    const cat = order.asin ? catalog.get(order.asin) : undefined
    return {
      ...order,
      title: order.title || cat?.title || null,
      imageUrl: order.imageUrl || cat?.imageUrl || null,
      items: order.items?.map(item => ({...item,title:item.title || (item.asin ? catalog.get(item.asin)?.title : null) || null,imageUrl:item.imageUrl || (item.asin ? catalog.get(item.asin)?.imageUrl : null) || null})),
    }
  })
  return { connectionKey: account, revision: cache.meta.revision, updatedAt: cache.meta.updatedAt, delta: false, records, issues: cache.meta.issues, orders: enrichedOrders, coverage: cache.meta.coverage }
}
