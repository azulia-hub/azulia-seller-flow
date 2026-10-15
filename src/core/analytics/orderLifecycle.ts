import type { CanonicalFinancialEvent } from '../data/types'
import type { ProductCost } from '../costs/types'
import { calculateCosts, type MissingCostPolicy } from '../costs/calculateCosts'
import { canonicalDateKey, summarizeDashboard } from './dashboardSummary'
import type { DateRange } from './timePeriods'

export interface OrderLifecycle {
  readonly orderId: string
  readonly saleDate: string | null
  readonly lastEventDate: string | null
  readonly events: readonly CanonicalFinancialEvent[]
  readonly releasedEvents: readonly CanonicalFinancialEvent[]
  readonly pendingEvents: readonly CanonicalFinancialEvent[]
  readonly followUpDays: number | null
}

export interface OrderCohort {
  readonly range: DateRange
  readonly observationThrough: string | null
  readonly orders: readonly OrderLifecycle[]
  readonly missingSale: readonly OrderLifecycle[]
  /** Available activity: explicit deferred transactions are excluded, unknown statuses retained. */
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
export const isDeferred = (event: CanonicalFinancialEvent) => event.status?.trim().toLowerCase() === 'deferred'
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

/** Match entire normalized source rows, never individual fee components. Preserve multiplicity.
 * Only an otherwise identical, explicitly Released row supersedes a Deferred row.
 * Ambiguous/date-shifted records remain pending; canonical source data is never modified.
 */
function resolvePendingRows(events: readonly CanonicalFinancialEvent[]) {
  const rows = new Map<string, CanonicalFinancialEvent[]>()
  for (const event of events) {
    const key = JSON.stringify([event.sourceDatasetId, event.sourceRow])
    const row = rows.get(key) ?? []
    row.push(event)
    rows.set(key, row)
  }
  const fingerprint = (row: readonly CanonicalFinancialEvent[]) => JSON.stringify(row.map(e => JSON.stringify([
    e.source, e.date, e.orderId, e.sku, e.event, e.quantity, e.amount, e.amountClass,
    e.amountType, e.state, e.city, e.accountType ?? null, e.fulfillmentType ?? null,
    e.rawType, e.rawDescription, e.classified,
    Object.entries(e.raw).filter(([key, value]) => !( /status/i.test(key) && String(value ?? '').trim().toLowerCase() === e.status?.trim().toLowerCase() )).sort(([a], [b]) => a.localeCompare(b)),
  ])).sort())
  const releasedCounts = new Map<string, number>()
  for (const row of rows.values()) {
    if (!row.every(e => e.status?.trim().toLowerCase() === 'released')) continue
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
export function buildOrderCohort(events: readonly CanonicalFinancialEvent[], range: DateRange): OrderCohort {
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
  const lifecycles: OrderLifecycle[] = [...byOrder].map(([orderId, orderEvents]) => {
    const saleDate = orderEvents.filter(isSale).map(e => canonicalDateKey(e.date)).filter((d): d is string => Boolean(d)).sort()[0] ?? null
    const lastEventDate = orderEvents.map(e => canonicalDateKey(e.date)).filter((d): d is string => Boolean(d)).sort().at(-1) ?? null
    return { orderId, saleDate, lastEventDate, events: orderEvents,
      releasedEvents: orderEvents.filter(e => !isDeferred(e)), pendingEvents: orderEvents.filter(isDeferred),
      followUpDays: saleDate && observationThrough ? Math.floor((Date.parse(observationThrough) - Date.parse(saleDate)) / 86_400_000) : null }
  })
  const orders = lifecycles.filter(o => inRange(o.saleDate, range))
  const missingSale = lifecycles.filter(o => !o.saleDate && o.events.some(e => inRange(canonicalDateKey(e.date), range)))
  const ids = new Set(orders.map(o => o.orderId))
  const globalPostedEvents = resolved.active.filter(e => !e.orderId && inRange(canonicalDateKey(e.date), range))
  const observedEvents = resolved.active.filter(e => e.orderId ? ids.has(e.orderId) : inRange(canonicalDateKey(e.date), range))
  return { range, observationThrough, orders, missingSale, globalPostedEvents, observedEvents,
    events: observedEvents.filter(e => !isDeferred(e)), pendingEvents: observedEvents.filter(isDeferred),
    supersededEvents: resolved.superseded.filter(e => e.orderId ? ids.has(e.orderId) : inRange(canonicalDateKey(e.date), range)),
    pendingOrderCount: orders.filter(o => o.pendingEvents.length).length,
    limitedFollowUpOrderCount: orders.filter(o => o.followUpDays !== null && o.followUpDays < 20).length,
    unspecifiedStatusEventCount: observedEvents.filter(e => !isDeferred(e) && e.status?.trim().toLowerCase() !== 'released').length }
}

export function summarizeActivity(events: readonly CanonicalFinancialEvent[]) {
  const summary = summarizeDashboard(events)
  return { ...summary, charges: round(summary.marketplaceCharges + summary.netEasyShipFee + summary.adsSpend),
    settlementNet: round(events.filter(e => e.amountClass === 'SETTLEMENT').reduce((total, e) => total + e.amount, 0)) }
}

export function buildCohortFinancials(cohort: OrderCohort, costs: readonly ProductCost[], policy: MissingCostPolicy, normalizeSku?: (sku: string) => string) {
  const financials = (events: readonly CanonicalFinancialEvent[]) => {
    const activity = summarizeActivity(events)
    const cost = calculateCosts(events, costs, policy, normalizeSku)
    return { ...activity, netCogs: cost.netCogs, profit: cost.profitReady ? round(activity.operatingNet - cost.netCogs) : null,
      missingCostSkus: cost.missingSkus, costComplete: cost.complete }
  }
  return { released: financials(cohort.events), pending: summarizeActivity(cohort.pendingEvents), estimated: financials(cohort.observedEvents),
    unmatched: cohort.missingSale.map(order => ({ ...order, released: financials(order.releasedEvents), pending: summarizeActivity(order.pendingEvents), estimated: financials(order.events) })),
    orders: cohort.orders.map(order => ({ ...order, released: financials(order.releasedEvents), pending: summarizeActivity(order.pendingEvents), estimated: financials(order.events) })) }
}
export type CohortFinancials = ReturnType<typeof buildCohortFinancials>
