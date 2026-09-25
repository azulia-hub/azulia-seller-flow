import type { CanonicalFinancialEvent } from '../data/types'
import { canonicalDateKey } from './dashboardSummary'
import type { DateRange } from './timePeriods'

export type OrderLifecycleStatus =
  | 'COMPLETED_DELIVERED'
  | 'COMPLETED_RETURNED'
  | 'INCOMPLETE_COVERAGE'
  | 'INCOMPLETE_DEFERRED'
  | 'INCOMPLETE_MISSING_SALE'

export interface OrderLifecycle {
  readonly orderId: string
  readonly saleDate: string | null
  readonly lastEventDate: string | null
  readonly lifecycleDeadline: string | null
  readonly status: OrderLifecycleStatus
  readonly events: readonly CanonicalFinancialEvent[]
  readonly grossSales: number
  readonly netOrderCharges: number
  readonly refundValue: number
  readonly reimbursements: number
  readonly reason: string
}

export interface CompletedOrderCohort {
  readonly range: DateRange
  readonly observationThrough: string | null
  readonly maturityDays: number
  readonly candidates: readonly OrderLifecycle[]
  readonly completed: readonly OrderLifecycle[]
  readonly incomplete: readonly OrderLifecycle[]
  readonly missingSale: readonly OrderLifecycle[]
  readonly events: readonly CanonicalFinancialEvent[]
  readonly globalPostedEvents: readonly CanonicalFinancialEvent[]
  readonly candidateOrderCount: number
  readonly completedOrderCount: number
  readonly incompleteOrderCount: number
  readonly missingSaleOrderCount: number
  readonly candidateSales: number
  readonly completedSales: number
  readonly incompleteSales: number
  readonly includedOrderCharges: number
  readonly includedRefundValue: number
  readonly excludedRefundValue: number
  readonly includedReimbursements: number
  readonly excludedOrderCharges: number
  readonly excludedReimbursements: number
  readonly orderCoveragePercent: number
  readonly salesCoveragePercent: number
}

const DAY_MS = 86_400_000
const isPositiveSale = (event: CanonicalFinancialEvent) => event.event === 'SALE' && event.amountType === 'PRODUCT_REVENUE' && event.amount > 0
const isRefund = (event: CanonicalFinancialEvent) => event.event === 'REFUND' || event.amountType === 'PRODUCT_REVENUE' && event.amount < 0
const inRange = (date: string | null, range: DateRange) => Boolean(date && date >= range.from && date <= range.to)
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00Z`)
  return new Date(parsed.getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

function lifecycleFor(orderId: string, events: readonly CanonicalFinancialEvent[], maturityDays: number, observationThrough: string | null): OrderLifecycle {
  const dated = events.flatMap(event => {
    const date = canonicalDateKey(event.date)
    return date ? [{ event, date }] : []
  }).sort((left, right) => left.date.localeCompare(right.date))
  const saleDates = dated.filter(item => isPositiveSale(item.event)).map(item => item.date)
  const refundDates = dated.filter(item => isRefund(item.event)).map(item => item.date)
  const saleDate = saleDates[0] ?? null
  const lastEventDate = dated.at(-1)?.date ?? null
  const lifecycleAnchor = refundDates.at(-1) ?? saleDate
  const lifecycleDeadline = lifecycleAnchor ? addDays(lifecycleAnchor, maturityDays) : null
  const grossSales = round(events.filter(isPositiveSale).reduce((total, event) => total + event.amount, 0))
  const netOrderCharges = round(-events.filter(event => event.amountClass === 'OPERATING' && event.amountType !== 'PRODUCT_REVENUE' && event.event === 'FEE').reduce((total, event) => total + event.amount, 0))
  const refundValue = round(-events.filter(isRefund).reduce((total, event) => total + event.amount, 0))
  const reimbursements = round(events.filter(event => event.amountClass === 'OPERATING' && event.event === 'REIMBURSEMENT').reduce((total, event) => total + event.amount, 0))
  const financials = { grossSales, netOrderCharges, refundValue, reimbursements }
  const hasDeferred = events.some(event => event.status?.trim().toLowerCase() === 'deferred')

  if (!saleDate) return { orderId, saleDate, lastEventDate, lifecycleDeadline, status: 'INCOMPLETE_MISSING_SALE', events, ...financials, reason: 'The original positive sale is not present in imported history.' }
  if (hasDeferred) return { orderId, saleDate, lastEventDate, lifecycleDeadline, status: 'INCOMPLETE_DEFERRED', events, ...financials, reason: 'At least one linked transaction is still deferred.' }
  if (!observationThrough || !lifecycleDeadline || observationThrough < lifecycleDeadline) return { orderId, saleDate, lastEventDate, lifecycleDeadline, status: 'INCOMPLETE_COVERAGE', events, ...financials, reason: `Imported history does not yet reach the lifecycle deadline${lifecycleDeadline ? ` of ${lifecycleDeadline}` : ''}.` }
  const returned = events.some(isRefund)
  return { orderId, saleDate, lastEventDate, lifecycleDeadline, status: returned ? 'COMPLETED_RETURNED' : 'COMPLETED_DELIVERED', events, ...financials, reason: returned ? 'The returned order has sufficient follow-up coverage.' : 'The order passed its follow-up window without a refund.' }
}

export function buildCompletedOrderCohort(events: readonly CanonicalFinancialEvent[], range: DateRange, maturityDays = 20): CompletedOrderCohort {
  const datedKeys = events.flatMap(event => canonicalDateKey(event.date) ? [canonicalDateKey(event.date)!] : []).sort()
  const observationThrough = datedKeys.at(-1) ?? null
  const byOrder = new Map<string, CanonicalFinancialEvent[]>()
  events.forEach(event => {
    if (!event.orderId) return
    byOrder.set(event.orderId, [...(byOrder.get(event.orderId) ?? []), event])
  })

  const lifecycles = [...byOrder].map(([orderId, orderEvents]) => lifecycleFor(orderId, orderEvents, maturityDays, observationThrough))
  const candidates = lifecycles.filter(item => inRange(item.saleDate, range))
  const completed = candidates.filter(item => item.status === 'COMPLETED_DELIVERED' || item.status === 'COMPLETED_RETURNED')
  const incomplete = candidates.filter(item => item.status === 'INCOMPLETE_COVERAGE' || item.status === 'INCOMPLETE_DEFERRED')
  const missingSale = lifecycles.filter(item => item.status === 'INCOMPLETE_MISSING_SALE' && item.events.some(event => inRange(canonicalDateKey(event.date), range)))
  const completedIds = new Set(completed.map(item => item.orderId))
  const globalPostedEvents = events.filter(event => !event.orderId && inRange(canonicalDateKey(event.date), range))
  const selectedEvents = events.filter(event => event.orderId && completedIds.has(event.orderId))
  const candidateSales = round(candidates.reduce((total, item) => total + item.grossSales, 0))
  const completedSales = round(completed.reduce((total, item) => total + item.grossSales, 0))
  const incompleteSales = round(incomplete.reduce((total, item) => total + item.grossSales, 0))
  const includedOrderCharges = round(completed.reduce((total, item) => total + item.netOrderCharges, 0))
  const includedRefundValue = round(completed.reduce((total, item) => total + item.refundValue, 0))
  const excludedRefundValue = round([...incomplete, ...missingSale].reduce((total, item) => total + item.refundValue, 0))
  const includedReimbursements = round(completed.reduce((total, item) => total + item.reimbursements, 0))
  const excludedOrderCharges = round([...incomplete, ...missingSale].reduce((total, item) => total + item.netOrderCharges, 0))
  const excludedReimbursements = round([...incomplete, ...missingSale].reduce((total, item) => total + item.reimbursements, 0))

  return {
    range, observationThrough, maturityDays, candidates, completed, incomplete, missingSale,
    events: [...selectedEvents, ...globalPostedEvents], globalPostedEvents,
    candidateOrderCount: candidates.length,
    completedOrderCount: completed.length,
    incompleteOrderCount: incomplete.length,
    missingSaleOrderCount: missingSale.length,
    candidateSales,
    completedSales,
    incompleteSales,
    includedOrderCharges,
    includedRefundValue,
    excludedRefundValue,
    includedReimbursements,
    excludedOrderCharges,
    excludedReimbursements,
    orderCoveragePercent: candidates.length ? completed.length / candidates.length * 100 : 0,
    salesCoveragePercent: candidateSales ? completedSales / candidateSales * 100 : 0,
  }
}
