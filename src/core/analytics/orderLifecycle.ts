import type { CanonicalFinancialEvent, CanonicalOrder } from '../data/types'
import type { ProductCost } from '../costs/types'
import { calculateCosts, createProductCostResolver, type MissingCostPolicy } from '../costs/calculateCosts'
import { canonicalDateKey, summarizeDashboard } from './dashboardSummary'
import type { DateRange } from './timePeriods'

export interface OrderLifecycle {
  readonly orderId: string
  readonly order?: CanonicalOrder
  readonly saleDate: string | null
  readonly lastEventDate: string | null
  readonly events: readonly CanonicalFinancialEvent[]
  readonly releasedEvents: readonly CanonicalFinancialEvent[]
  readonly pendingEvents: readonly CanonicalFinancialEvent[]
  readonly followUpDays: number | null
}

export type ActivityInclusion = 'RELEASED_ONLY' | 'ALL_RECORDED'

export interface OrderCohort {
  readonly inclusion?: ActivityInclusion
  readonly range: DateRange
  readonly observationThrough: string | null
  readonly orders: readonly OrderLifecycle[]
  readonly missingSale: readonly OrderLifecycle[]
  readonly outsidePeriod?: readonly OrderLifecycle[]
  /** Activity included by the requested recognition policy; never gated by order completion. */
  readonly events: readonly CanonicalFinancialEvent[]
  readonly pendingEvents: readonly CanonicalFinancialEvent[]
  readonly observedEvents: readonly CanonicalFinancialEvent[]
  readonly globalPostedEvents: readonly CanonicalFinancialEvent[]
  readonly supersededEvents: readonly CanonicalFinancialEvent[]
  readonly pendingOrderCount: number
  readonly limitedFollowUpOrderCount: number
  readonly unspecifiedStatusEventCount: number
}

const isSale = (event: CanonicalFinancialEvent) => event.event === 'SALE' && event.amountType === 'PRODUCT_REVENUE' && event.amount > 0
const inRange = (date: string | null, range: DateRange) => Boolean(date && date >= range.from && date <= range.to)
export const isDeferred = (event: CanonicalFinancialEvent) => event.releaseState !== undefined ? event.releaseState !== 'RELEASED' : event.status?.trim().toLowerCase() === 'deferred'
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

/** Match entire normalized source rows, never individual fee components. Preserve multiplicity.
 * Only an otherwise identical, explicitly Released row supersedes a Deferred row.
 * Ambiguous/date-shifted records remain pending; canonical source data is never modified.
 */
function resolvePendingRows(events: readonly CanonicalFinancialEvent[]) {
  if (!events.some(event => !event.sourceIdentityResolved && isDeferred(event))) return { active: events, superseded: [] as CanonicalFinancialEvent[] }
  const rows = new Map<string, CanonicalFinancialEvent[]>()
  for (const event of events) {
    if (event.sourceIdentityResolved) continue
    const key = JSON.stringify([event.sourceDatasetId, event.sourceRow])
    const row = rows.get(key) ?? []
    row.push(event)
    rows.set(key, row)
  }
  const fingerprint = (row: readonly CanonicalFinancialEvent[]) => JSON.stringify(row.map(e => JSON.stringify([
    e.source, e.date, e.orderPurchaseDate, e.orderId, e.sku, e.event, e.quantity, e.amount, e.amountClass,
    e.amountType, e.state, e.city, e.accountType ?? null, e.fulfillmentType ?? null,
    e.rawType, e.rawDescription, e.classified,
    Object.entries(e.raw).filter(([key, value]) => !( /status/i.test(key) && String(value ?? '').trim().toLowerCase() === e.status?.trim().toLowerCase() )).sort(([a], [b]) => a.localeCompare(b)),
  ])).sort())
  const releasedCounts = new Map<string, number>()
  for (const row of rows.values()) {
    if (!row.every(e => !isDeferred(e) && (e.releaseState === 'RELEASED' || e.status?.trim().toLowerCase() === 'released'))) continue
    const key = fingerprint(row)
    releasedCounts.set(key, (releasedCounts.get(key) ?? 0) + 1)
  }
  const superseded = new Set<CanonicalFinancialEvent>()
  for (const row of rows.values()) {
    if (!row.every(isDeferred)) continue
    const key = fingerprint(row)
    const matches = releasedCounts.get(key) ?? 0
    if (!matches) continue
    row.forEach(event => superseded.add(event))
    releasedCounts.set(key, matches - 1)
  }
  return { active: events.filter(e => !superseded.has(e)), superseded: events.filter(e => superseded.has(e)) }
}

/** The date range selects original sales; linked activity is searched across the active file. */
export function indexOrderHistory(events: readonly CanonicalFinancialEvent[], orders: readonly CanonicalOrder[] = []) {
  const dated = events.map(e => canonicalDateKey(e.date)).filter((date): date is string => Boolean(date)).sort()
  const observationThrough = dated.at(-1) ?? null
  const resolved = resolvePendingRows(events)
  const byOrder = new Map<string, CanonicalFinancialEvent[]>()
  for (const event of resolved.active) {
    if (!event.orderId) continue
    const order = byOrder.get(event.orderId) ?? []
    order.push(event)
    byOrder.set(event.orderId, order)
  }
  const metadata = new Map(orders.map(order => [order.orderId, order]))
  for (const order of orders) if (!byOrder.has(order.orderId)) byOrder.set(order.orderId, [])
  const lifecycles: OrderLifecycle[] = [...byOrder].map(([orderId, orderEvents]) => {
    const order = metadata.get(orderId)
    const explicitDates = orderEvents.filter(e => e.orderPurchaseDate !== undefined)
    const purchaseDates = [...new Set(explicitDates.map(e => canonicalDateKey(e.orderPurchaseDate ?? null)).filter((d): d is string => Boolean(d)))]
    // An API order without a verified purchase date must not inherit its release date.
    const saleDate = order ? canonicalDateKey(order.purchaseDate) : explicitDates.length ? purchaseDates.length === 1 ? purchaseDates[0] : null : orderEvents.filter(isSale).map(e => canonicalDateKey(e.date)).filter((d): d is string => Boolean(d)).sort()[0] ?? null
    const lastEventDate = orderEvents.map(e => canonicalDateKey(e.date)).filter((d): d is string => Boolean(d)).sort().at(-1) ?? null
    return { orderId, order, saleDate, lastEventDate, events: orderEvents,
      releasedEvents: orderEvents.filter(e => !isDeferred(e)), pendingEvents: orderEvents.filter(isDeferred),
      followUpDays: saleDate && observationThrough ? Math.floor((Date.parse(observationThrough) - Date.parse(saleDate)) / 86_400_000) : null }
  })
  return { observationThrough, resolved, lifecycles }
}
export function selectOrderCohort(index: ReturnType<typeof indexOrderHistory>, range: DateRange, inclusion: ActivityInclusion = 'RELEASED_ONLY'): OrderCohort {
  const { observationThrough, resolved, lifecycles } = index
  const orders = lifecycles.filter(o => inRange(o.saleDate, range))
  const missingSale = lifecycles.filter(o => !o.saleDate && o.events.some(e => inRange(canonicalDateKey(e.date), range)))
  const ids = new Set(orders.map(o => o.orderId))
  const globalPostedEvents = resolved.active.filter(e => !e.orderId && !e.orderOriginRequired && inRange(canonicalDateKey(e.date), range))
  const observedEvents = resolved.active.filter(e => e.orderId ? ids.has(e.orderId) : !e.orderOriginRequired && inRange(canonicalDateKey(e.date), range))
  const outsidePeriod = lifecycles.filter(order => order.saleDate && !inRange(order.saleDate, range) && order.events.some(event => inRange(canonicalDateKey(event.date), range)))
  return { range, inclusion, observationThrough, orders, missingSale, outsidePeriod, globalPostedEvents, observedEvents,
    events: inclusion === 'ALL_RECORDED' ? observedEvents : observedEvents.filter(e => !isDeferred(e)), pendingEvents: observedEvents.filter(isDeferred),
    supersededEvents: resolved.superseded.filter(e => e.orderId ? ids.has(e.orderId) : inRange(canonicalDateKey(e.date), range)),
    pendingOrderCount: orders.filter(o => o.pendingEvents.length).length,
    limitedFollowUpOrderCount: orders.filter(o => o.followUpDays !== null && o.followUpDays < 20).length,
    unspecifiedStatusEventCount: observedEvents.filter(e => !isDeferred(e) && e.status?.trim().toLowerCase() !== 'released').length }
}

export function buildOrderCohort(events: readonly CanonicalFinancialEvent[], range: DateRange, inclusion: ActivityInclusion = 'RELEASED_ONLY', orders: readonly CanonicalOrder[] = []): OrderCohort {
  return selectOrderCohort(indexOrderHistory(events, orders), range, inclusion)
}

export function summarizeActivity(events: readonly CanonicalFinancialEvent[]) {
  const summary = summarizeDashboard(events)
  return { ...summary, charges: round(summary.marketplaceCharges + summary.netEasyShipFee + summary.adsSpend),
    settlementNet: round(events.filter(e => e.amountClass === 'SETTLEMENT').reduce((total, e) => total + e.amount, 0)) }
}

export function buildCohortFinancials(cohort: OrderCohort, costs: readonly ProductCost[], policy: MissingCostPolicy, normalizeSku?: (sku: string) => string, includeOrderDetails = true) {
  const resolveCost = createProductCostResolver(costs, normalizeSku)
  const financials = (events: readonly CanonicalFinancialEvent[]) => {
    const activity = summarizeActivity(events)
    const cost = calculateCosts(events, costs, policy, normalizeSku, resolveCost)
    return { ...activity, netCogs: cost.netCogs, profit: cost.profitReady ? round(activity.operatingNet - cost.netCogs) : null,
      missingCostSkus: cost.missingSkus, costComplete: cost.complete }
  }
  const recorded = financials(cohort.observedEvents)
  const detail = (order: OrderLifecycle) => {
    const recorded = financials(order.events)
    return { ...order, recorded, released: financials(order.releasedEvents), pending: summarizeActivity(order.pendingEvents), estimated: recorded }
  }
  return { recorded, released: cohort.inclusion === 'ALL_RECORDED' ? recorded : financials(cohort.events), pending: summarizeActivity(cohort.pendingEvents), estimated: recorded,
    unmatched: (includeOrderDetails ? cohort.missingSale : []).map(detail),
    orders: (includeOrderDetails ? cohort.orders : []).map(detail) }
}
export type CohortFinancials = ReturnType<typeof buildCohortFinancials>

export interface CohortExcludedRecord { key: string; orderId: string | null; purchaseDate: string | null; reason: 'PENDING' | 'MISSING_DATE' | 'OUTSIDE_PERIOD'; amount: number; components: number }
/** Financial record counts, not normalized component counts or wholly excluded order counts. */
export function cohortExcludedRecords(cohort: OrderCohort): CohortExcludedRecord[] {
  const records = new Map<string, CohortExcludedRecord>()
  const selected = new Map(cohort.orders.map(order => [order.orderId, order.saleDate]))
  const add = (event: CanonicalFinancialEvent, reason: CohortExcludedRecord['reason'], purchaseDate: string | null) => {
    const key = JSON.stringify([event.sourceDatasetId, event.sourceTransactionId || event.sourceRow])
    const old = records.get(key)
    if (old) { records.set(key, { ...old, amount: round(old.amount + event.amount), components: old.components + 1 }); return }
    records.set(key, { key, orderId: event.orderId, purchaseDate, reason, amount: event.amount, components: 1 })
  }
  if (cohort.inclusion !== 'ALL_RECORDED') for (const event of cohort.pendingEvents) add(event, 'PENDING', selected.get(event.orderId ?? '') ?? null)
  for (const order of cohort.missingSale) for (const event of order.events) if (inRange(canonicalDateKey(event.date), cohort.range)) add(event, 'MISSING_DATE', null)
  for (const order of cohort.outsidePeriod ?? []) for (const event of order.events) if (inRange(canonicalDateKey(event.date), cohort.range)) add(event, 'OUTSIDE_PERIOD', order.saleDate)
  return [...records.values()]
}

/** Count original financial records rather than their normalized monetary components. */
export function countFinancialRecords(events: readonly CanonicalFinancialEvent[]): number {
  return new Set(events.map(event => JSON.stringify([event.sourceDatasetId, event.sourceTransactionId || event.sourceRow]))).size
}

/** Counts include order-only records; money still comes exclusively from financial events. */
export function summarizeCohortOrders(cohort: OrderCohort) {
  const awaitingFinancials = cohort.orders.filter(order => !order.events.length)
  return { count: cohort.orders.length, awaitingFinancials, awaitingFinancialCount: awaitingFinancials.length }
}
