import { reportColumn, type ReportColumn } from './fieldMapping'
import { amazonUnifiedTransactionAdapter } from '../amazon/unifiedTransactionAdapter'
import type { RawDataset, RawRow } from '../../core/data/types'
import type { SyncSnapshot } from './protocol'
import { cents, decimal, object, text } from './money'
const code = (value: unknown) => text(value).toLowerCase().replace(/[^a-z0-9]/g, '')
const kinds: Record<string, string> = { miscellaneousledgeradjustment: 'API ledger adjustment', taxwithholding: 'Tax Withheld', adjustment: 'API adjustment', shipment: 'Order', refund: 'Refund', servicefee: 'Service Fee', servicefeerefund: 'Service Fee', fbainventoryfee: 'FBA Inventory Fee', fbainventoryreimbursement: 'Reimbursements', reimbursement: 'Reimbursements', disbursement: 'Transfer', transfer: 'Transfer', settlement: 'Transfer', productadspayment: 'Service Fee' }
const list = (value: unknown) => Array.isArray(value) ? value.map(object) : []
function money(value: unknown, neutralChild = false) {
  const row = object(value), amount = cents(row.currencyAmount)
  // The parent transaction has already been validated as INR. A currencyless zero
  // child is a neutral placeholder, not an unsupported nonzero money movement.
  if (neutralChild && amount === 0n && (row.currencyCode === null || row.currencyCode === undefined || row.currencyCode === '')) return 0n
  if (row.currencyCode !== 'INR') throw new Error(`API money currency is ${typeof row.currencyCode === 'string' && /^[A-Z]{3}$/.test(row.currencyCode) ? row.currencyCode : 'missing or invalid'}. Nonzero or transaction-level money cannot be treated as INR; the previous reading is retained.`)
  if (amount === null) throw new Error('An API INR amount has an unsupported numeric format. Source records are retained; the previous reading is unchanged.')
  return amount
}
/** Translate delivery only: all existing normalization, GST, costs and analytics remain unchanged. */
export function toUnifiedReport(snapshot: SyncSnapshot) {
  if (snapshot.records.some(record => !text(record.transactionId))) throw new Error('Source transaction identity is missing; no automatic records were merged.')
  let absoluteVolume = 0n
  const rows: Record<string, string | number | null>[] = [], issues: string[] = [...(snapshot.issues ?? [])], records = new Map(snapshot.records.map(record => [text(record.transactionId), record]))
  const orderMetadata = new Map((snapshot.orders ?? []).map(order => [order.id, order]))
  const orderReferences = (record: Record<string, unknown>) => [...new Set(list(record.relatedIdentifiers).filter(row => row.relatedIdentifierName === 'ORDER_ID').map(row => text(row.relatedIdentifierValue)).filter(Boolean))].sort().join('|')
  const superseded = new Set<string>()
  for (const record of records.values()) {
    const references = list(record.relatedIdentifiers)
    const targets = references.filter(row => row.relatedIdentifierName === 'DEFERRED_TRANSACTION_ID').map(row => text(row.relatedIdentifierValue))
    const releaseIds = references.filter(row => row.relatedIdentifierName === 'RELEASE_TRANSACTION_ID').map(row => text(row.relatedIdentifierValue))
    for (const [old, release] of [...targets.map(id => [records.get(id), record]), ...releaseIds.map(id => [record, records.get(id)])]) {
      if (old && release && ['DEFERRED','DEFERRED_RELEASED'].includes(text(old.transactionStatus).toUpperCase()) && text(release.transactionStatus).toUpperCase() === 'RELEASED' && code(old.transactionType) === code(release.transactionType) && orderReferences(old) === orderReferences(release) && object(old.totalAmount).currencyCode === object(release.totalAmount).currencyCode) superseded.add(text(old.transactionId))
    }
  }
  const ordered = [...records.values()].filter(record => !superseded.has(text(record.transactionId))).sort((a, b) => Date.parse(text(a.postedDate)) - Date.parse(text(b.postedDate)) || text(a.transactionId).localeCompare(text(b.transactionId)))
  for (const record of ordered) {
    const id = text(record.transactionId), kind = code(record.transactionType), source = money(record.totalAmount)
    const ids = list(record.relatedIdentifiers).filter(row => row.relatedIdentifierName === 'ORDER_ID').map(row => text(row.relatedIdentifierValue)).filter(Boolean)
    const orderId = [...new Set(ids)].length === 1 ? ids[0] : ''
    const purchaseTimestamp = orderMetadata.get(orderId)?.purchased || text(record.azuliaOrderPurchaseDate)
    const purchaseDate = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(purchaseTimestamp) && Number.isFinite(Date.parse(purchaseTimestamp)) ? new Date(Date.parse(purchaseTimestamp) + 330 * 60000).toISOString().slice(0, 10) : null
    if (orderId && !purchaseDate) issues.push('Some orders await a verified purchase date. Their activity is retained in missing-origin review and excluded from purchase-period totals until resolved.')
    if (!orderId && ['shipment','refund'].includes(kind)) issues.push('Some shipment/refund activity has no reliable order identity. It remains in source evidence and posted reconciliation, outside purchase-period totals.')
    const status = text(record.transactionStatus).toUpperCase()
    const releaseUnknown = status === 'DEFERRED_RELEASED' && list(record.relatedIdentifiers).some(row => row.relatedIdentifierName === 'RELEASE_TRANSACTION_ID')
    if (releaseUnknown) issues.push('A previously deferred transaction has no supported complete release match; its original source remains visible for review.')
    const type = !['RELEASED','DEFERRED','DEFERRED_RELEASED'].includes(status) ? `API review: ${text(record.transactionType)}` : kinds[kind] ?? text(record.transactionType)
    const posted = new Date(Date.parse(text(record.postedDate)) + 330 * 60000).toISOString().replace('Z', '+05:30')
    const account = text(object(record.sellingPartnerMetadata).accountType)
    const itemKeys = new Map(list(record.items).map((item, index) => [item, text(list(item.relatedIdentifiers).find(row => row.itemRelatedIdentifierName === 'TRANSACTION_ID')?.itemRelatedIdentifierValue) || `item:${index}`] as const))
    const rowOccurrences = new Map<string, number>()
    const quantityUsed = new Set<Record<string, unknown>>()
    let first = true, emitted = 0n
    const emit = (value: bigint, path: string[], item: Record<string, unknown>, forceUnknown = false) => {
      if (value === 0n) return
      const contexts = list(item.contexts).filter(row => row.contextType === 'ProductContext'), context = contexts.length === 1 ? contexts[0] : {}
      // This delivery driver is India-only. Matched owner CSV rows establish that its
      // MFNPostageFee (including tax/reversals) is the report's Easy Ship charge.
      const mapped: ReportColumn = forceUnknown ? { column: null, description: path.join(' / ') } : reportColumn(kind, path, { mfnPostageIsEasyShip: true, sourceDescription: text(record.description) })
      if (mapped.note) issues.push(mapped.note)
      const rowType = ['RELEASED','DEFERRED','DEFERRED_RELEASED'].includes(status) && (Object.hasOwn(kinds, kind) || kind === 'adjustment') ? mapped.type ?? type : type
      const quantity = !quantityUsed.has(item) && mapped.column === 'product sales' && typeof context.quantityShipped === 'number' && Number.isSafeInteger(context.quantityShipped) ? Math.abs(context.quantityShipped) : null
      if (quantity !== null) quantityUsed.add(item)
      const baseKey = JSON.stringify([id, itemKeys.get(item) ?? 'transaction', path]), occurrence = rowOccurrences.get(baseKey) ?? 0
      rowOccurrences.set(baseKey, occurrence + 1)
      const row: Record<string, string | number | null> = { 'date/time': posted, 'settlement id': '', type: rowType, 'order id': orderId, sku: text(context.sku), quantity,
        'order state': '', 'order city': '', fulfillment: text(context.fulfillmentNetwork) || orderMetadata.get(orderId)?.fulfillmentType || '', 'account type': account, 'Transaction Status': status === 'DEFERRED' || releaseUnknown ? 'Deferred' : ['RELEASED','DEFERRED_RELEASED'].includes(status) ? 'Released' : 'Unknown',
        'product title': text(object(record.azuliaCatalogTitles)[text(context.asin)]) || (mapped.column === 'product sales' ? text(item.description) : '') || '', 'product image': text(object(record.azuliaCatalogImages)[text(context.asin)]) || '', asin: text(context.asin), description: mapped.description || text(record.description), total: decimal(value), 'api transaction id': id, 'api row key': `${baseKey}:${occurrence}`, 'api component': path.join(' / '), 'api currency': 'INR', 'api source total': decimal(source), 'api order purchase date': purchaseDate, 'api order origin required': orderId || ['shipment','refund'].includes(kind) ? 'yes' : 'no' }
      if (mapped.column) row[mapped.column] = decimal(value)
      else { row['api unmapped amount'] = decimal(value); issues.push(`Unmapped API component: ${path.join(' / ')}`) }
      if (first) { row['api raw record'] = JSON.stringify(record); first = false }
      absoluteVolume += value < 0n ? -value : value
      if (absoluteVolume > BigInt(Number.MAX_SAFE_INTEGER) / 100n) throw new Error('Source amounts exceed the precision supported by the existing report engine.')
      rows.push(row); emitted += value
    }
    const walk = (parts: unknown, item: Record<string, unknown>, path: string[] = [], depth = 0): bigint => {
      if (depth > 32) throw new Error('Source breakdown nesting is unsupported; the previous reading is retained.')
      let total = 0n
      for (const part of list(parts)) {
        const next = [...path, text(part.breakdownType) || 'Unlabelled']
        if (Array.isArray(part.breakdowns) && part.breakdowns.length) {
          const children = walk(part.breakdowns, item, next, depth + 1), amount = part.breakdownAmount === undefined ? children : money(part.breakdownAmount, true)
          if (amount !== children) emit(amount - children, [...next, 'Unclassified difference'], item, true)
          total += amount
        } else { const amount = money(part.breakdownAmount, true); emit(amount, next, item); total += amount }
      }
      return total
    }
    const items = list(record.items)
    if (items.length) {
      for (const item of items) {
        const parts = walk(item.breakdowns, item)
        if (item.totalAmount !== undefined) {
          const total = money(item.totalAmount, true)
          if (parts !== total) {
            // Account TDS has a labelled item total but no nested breakdown in the source.
            if (!list(item.breakdowns).length && kind === 'taxwithholding' && code(item.description) === 'tdssection194o') emit(total, ['Item total', text(item.description)], item)
            else emit(total - parts, ['Unclassified item difference'], item, true)
          }
        }
      }
    } else walk(record.breakdowns, {})
    // Item and transaction trees are overlapping views. Never count both as money.
    if (emitted !== source) emit(source - emitted, ['Unallocated transaction difference'], {}, true)
    if (!items.length) issues.push('Some transactions have no item identity. They remain unallocated, not spread across products.')
  }
  const raw: RawDataset = { id: `api:${snapshot.connectionKey}`, name: 'Amazon activity · automatic', headers: [...new Set(rows.flatMap(row => Object.keys(row)))], rows: rows as RawRow[], metadata: { revision: String(snapshot.revision), updatedAt: snapshot.updatedAt ?? '', delivery: 'Finances API adapted to Unified columns; not a portal CSV export' } }
  const normalized = amazonUnifiedTransactionAdapter.normalize(raw)
  const orders = (snapshot.orders ?? []).map(order => {
    if (!/^[A-Z0-9]{3}-\d{7}-\d{7}$/.test(order.id) || !Number.isFinite(Date.parse(order.purchased))) throw new Error('Unsupported order summary; the previous reading is retained.')
    return {
      isReplacementOrder:order.isReplacementOrder,replacedOrderId:order.replacedOrderId,earliestDeliveryDate:order.earliestDeliveryDate,latestDeliveryDate:order.latestDeliveryDate,reviewMetadataCheckedAt:order.reviewMetadataCheckedAt,
      orderId: order.id,
      purchaseDate: order.purchased,
      status: order.status,
      fulfillmentType: order.fulfillmentType,
      orderValue: order.orderValue,
      currency: order.currency,
      ...(order.sku ? { sku: order.sku } : {}),
      ...(order.asin ? { asin: order.asin } : {}),
      ...(order.title ? { title: order.title } : {}),
      ...(order.imageUrl ? { imageUrl: order.imageUrl } : {}),
      ...(order.items && order.items.length ? { items: order.items } : {}),
    }
  })
  const dataset = { ...normalized, orders, events: normalized.events.map(event => ({ ...event, sourceIdentityResolved: true, sourceTransactionId: text(rows[event.sourceRow - 1]['api transaction id']), descriptionIsProductTitle: false, orderPurchaseDate: text(rows[event.sourceRow - 1]['api order purchase date']) || null, orderOriginRequired: rows[event.sourceRow - 1]['api order origin required'] === 'yes', releaseState: event.status === 'Released' ? 'RELEASED' as const : event.status === 'Deferred' ? 'PENDING' as const : 'UNKNOWN' as const, id: `${raw.id}:${String(rows[event.sourceRow - 1]['api row key'])}:${event.amountType}` })) }
  if (!dataset.quality.reconciliation.reconciled) throw new Error('Automatic source does not reconcile with existing report normalization. The previous reading is retained.')
  return { raw, dataset, issues: [...new Set(issues)] }
}
