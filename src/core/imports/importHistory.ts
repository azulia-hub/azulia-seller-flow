import { canonicalDateKey, filterEvents, summarizeDashboard } from '../analytics/dashboardSummary'
import { calculateCosts, type MissingCostPolicy } from '../costs/calculateCosts'
import type { ProductCost } from '../costs/types'
import type { CanonicalDataset, CanonicalFinancialEvent } from '../data/types'

export interface ImportProfile {
  readonly fromDate: string | null
  readonly toDate: string | null
  readonly datedEventCount: number
  readonly undatedEventCount: number
  readonly orderCount: number
}

export interface StoredImport {
  readonly id: string
  readonly fileName: string
  readonly importedAt: string
  readonly dataset: CanonicalDataset
  readonly profile: ImportProfile
}

export interface ImportComparisonSide {
  readonly grossSales: number
  readonly operatingNet: number
  readonly netCogs: number
  readonly profitAfterAds: number
  readonly soldQuantity: number
  readonly returnQuantity: number
  readonly adsSpend: number
  readonly marketplaceCharges: number
  readonly netEasyShipFee: number
  readonly reimbursements: number
  readonly eventCount: number
  readonly costCoveragePercent: number
}

export interface ImportComparison {
  readonly overlap: { readonly fromDate: string; readonly toDate: string } | null
  readonly left: ImportComparisonSide | null
  readonly right: ImportComparisonSide | null
  readonly matchingEventCount: number
  readonly leftOnlyEventCount: number
  readonly rightOnlyEventCount: number
  readonly difference: ImportComparisonSide | null
  readonly identical: boolean
}

export function profileDataset(dataset: CanonicalDataset): ImportProfile {
  const dates = dataset.events.flatMap((event) => { const date = canonicalDateKey(event.date); return date ? [date] : [] }).sort()
  return {
    fromDate: dates[0] ?? null,
    toDate: dates.at(-1) ?? null,
    datedEventCount: dates.length,
    undatedEventCount: dataset.events.length - dates.length,
    orderCount: new Set(dataset.events.flatMap((event) => event.orderId ? [event.orderId] : [])).size,
  }
}

function eventFingerprint(event: CanonicalFinancialEvent) {
  return [canonicalDateKey(event.date) ?? '', event.orderId ?? '', event.sku ?? '', event.event, event.amountType, event.amountClass, event.amount, event.quantity ?? '', event.rawType, event.rawDescription ?? '', event.state ?? '', event.city ?? '', event.status ?? ''].join('\u001f')
}

function intersectionCount(left: readonly CanonicalFinancialEvent[], right: readonly CanonicalFinancialEvent[]) {
  const rightCounts = new Map<string, number>()
  right.forEach((event) => { const key = eventFingerprint(event); rightCounts.set(key, (rightCounts.get(key) ?? 0) + 1) })
  return left.reduce((count, event) => {
    const key = eventFingerprint(event)
    const available = rightCounts.get(key) ?? 0
    if (!available) return count
    rightCounts.set(key, available - 1)
    return count + 1
  }, 0)
}

function comparisonSide(events: readonly CanonicalFinancialEvent[], costs: readonly ProductCost[], policy: MissingCostPolicy, normalizeSku: (source: string, sku: string) => string): ImportComparisonSide {
  const summary = summarizeDashboard(events)
  const cost = calculateCosts(events, costs, policy, (sku) => normalizeSku(events[0]?.source ?? '', sku))
  return {
    grossSales: summary.grossSales,
    operatingNet: summary.operatingNet,
    netCogs: cost.netCogs,
    profitAfterAds: Math.round((summary.operatingNet - cost.netCogs + Number.EPSILON) * 100) / 100,
    soldQuantity: summary.soldQuantity,
    returnQuantity: summary.returnQuantity,
    adsSpend: summary.adsSpend,
    marketplaceCharges: summary.marketplaceCharges,
    netEasyShipFee: summary.netEasyShipFee,
    reimbursements: summary.reimbursements,
    eventCount: events.length,
    costCoveragePercent: cost.coveragePercent,
  }
}

function comparisonDifference(left: ImportComparisonSide, right: ImportComparisonSide): ImportComparisonSide {
  const delta = (a: number, b: number) => Math.round((a - b + Number.EPSILON) * 100) / 100
  return {
    grossSales: delta(left.grossSales, right.grossSales),
    operatingNet: delta(left.operatingNet, right.operatingNet),
    netCogs: delta(left.netCogs, right.netCogs),
    profitAfterAds: delta(left.profitAfterAds, right.profitAfterAds),
    soldQuantity: delta(left.soldQuantity, right.soldQuantity),
    returnQuantity: delta(left.returnQuantity, right.returnQuantity),
    adsSpend: delta(left.adsSpend, right.adsSpend),
    marketplaceCharges: delta(left.marketplaceCharges, right.marketplaceCharges),
    netEasyShipFee: delta(left.netEasyShipFee, right.netEasyShipFee),
    reimbursements: delta(left.reimbursements, right.reimbursements),
    eventCount: delta(left.eventCount, right.eventCount),
    costCoveragePercent: delta(left.costCoveragePercent, right.costCoveragePercent),
  }
}

export function compareImports(left: StoredImport, right: StoredImport, costs: readonly ProductCost[] = [], policy: MissingCostPolicy = 'BLOCK', normalizeSku: (source: string, sku: string) => string = (_source, sku) => sku): ImportComparison {
  const fromDate = left.profile.fromDate && right.profile.fromDate ? (left.profile.fromDate > right.profile.fromDate ? left.profile.fromDate : right.profile.fromDate) : null
  const toDate = left.profile.toDate && right.profile.toDate ? (left.profile.toDate < right.profile.toDate ? left.profile.toDate : right.profile.toDate) : null
  if (!fromDate || !toDate || fromDate > toDate) return { overlap: null, left: null, right: null, matchingEventCount: 0, leftOnlyEventCount: 0, rightOnlyEventCount: 0, difference: null, identical: false }
  const leftEvents = filterEvents(left.dataset.events, { fromDate, toDate })
  const rightEvents = filterEvents(right.dataset.events, { fromDate, toDate })
  const matchingEventCount = intersectionCount(leftEvents, rightEvents)
  const leftSide = comparisonSide(leftEvents, costs, policy, normalizeSku)
  const rightSide = comparisonSide(rightEvents, costs, policy, normalizeSku)
  const difference = comparisonDifference(leftSide, rightSide)
  const leftOnlyEventCount = leftEvents.length - matchingEventCount
  const rightOnlyEventCount = rightEvents.length - matchingEventCount
  return {
    overlap: { fromDate, toDate },
    left: leftSide,
    right: rightSide,
    matchingEventCount,
    leftOnlyEventCount,
    rightOnlyEventCount,
    difference,
    identical: leftOnlyEventCount === 0 && rightOnlyEventCount === 0 && Object.values(difference).every(value => value === 0),
  }
}
