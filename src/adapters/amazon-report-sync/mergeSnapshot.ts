import { sameContent } from '../../core/sync/sameContent'
import type { SourceOrderSummary, SyncSnapshot } from './protocol'

/** Source revision/coverage timestamps are not financial or order-content changes. */
export function mergeSnapshot(snapshot: SyncSnapshot, previousRecords: Record<string, unknown>[] | null, previousOrders: SourceOrderSummary[] | null) {
  const previous = new Map((previousRecords ?? []).map(record => [String(record.transactionId), record]))
  const merged = snapshot.delta ? new Map(previous) : new Map<string, Record<string, unknown>>()
  let recordsChanged = previousRecords === null
  for (const record of snapshot.records) {
    if (typeof record.transactionId !== 'string' || !record.transactionId) throw new Error('Source transaction identity is missing; the previous reading is retained.')
    const old = previous.get(record.transactionId)
    const unchanged = old !== undefined && sameContent(old, record)
    if (!unchanged) recordsChanged = true
    merged.set(record.transactionId, old && unchanged ? old : record)
  }
  if (merged.size !== previous.size) recordsChanged = true
  const orders = snapshot.orders ?? previousOrders ?? []
  const oldOrders = new Map((previousOrders ?? []).map(order => [order.id, order]))
  const ordersChanged = previousOrders === null || oldOrders.size !== orders.length
    || orders.some(order => !sameContent(oldOrders.get(order.id), order))
  return {
    changed: recordsChanged || ordersChanged,
    snapshot: { ...snapshot, delta: false, records: recordsChanged ? [...merged.values()] : previousRecords ?? [], orders },
  }
}
