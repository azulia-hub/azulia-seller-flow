import type { SkuProfitSummary } from './orderProfit'
import type { DateRange } from './timePeriods'
import { missingRanges, type SyncRange } from '../sync/ranges'
export type HistoryCoverage = 'DOWNLOADED' | 'INCOMPLETE' | 'UNVERIFIED'
export type PerformanceMetric = 'sales' | 'proceeds' | 'units' | 'orders' | 'profit' | 'margin' | 'returnRate'
export interface PerformanceChange {
  readonly value: number | null
  readonly previous: number | null
  readonly change: number | null
  readonly kind: 'percent' | 'points'
  readonly status: 'AVAILABLE' | 'ZERO_BASELINE' | 'NO_HISTORY' | 'MISSING_COST' | 'NO_BASELINE'
}
export interface ProductPerformance {
  readonly sales: PerformanceChange; readonly proceeds: PerformanceChange
  readonly units: PerformanceChange; readonly orders: PerformanceChange
  readonly profit: PerformanceChange; readonly margin: PerformanceChange; readonly returnRate: PerformanceChange
}
const round = (value: number) => Math.round(value * 100) / 100
/** Net marketplace proceeds before inventory cost, ads and separate tax/account adjustments. */
export function productProceeds(product: SkuProfitSummary): number {
  return round(product.grossSales - (product.customerRefunds ?? product.orders.reduce((total, order) => total + order.refunds, 0)) - product.marketplaceCharges - product.shippingFees + product.reimbursements)
}
/** Presence of records is not proof of complete pagination. Date ranges are inclusive; source coverage has exclusive ends. */
export function productHistoryCoverage(range: DateRange | undefined, financial: readonly SyncRange[] | undefined, purchases: readonly SyncRange[] | undefined, utcOffsetMinutes = 0): HistoryCoverage {
  if (!range || !financial || !purchases) return 'UNVERIFIED'
  const start = Date.parse(`${range.from}T00:00:00Z`) - utcOffsetMinutes * 60000, end = Date.parse(`${range.to}T00:00:00Z`) - utcOffsetMinutes * 60000 + 86400000
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return 'UNVERIFIED'
  const wanted = { from: new Date(start).toISOString(), to: new Date(end).toISOString() }
  return missingRanges(wanted, financial).length || missingRanges(wanted, purchases).length ? 'INCOMPLETE' : 'DOWNLOADED'
}
export function compareProductPerformance(current: SkuProfitSummary, previous: SkuProfitSummary | undefined, coverage: HistoryCoverage): ProductPerformance {
  function compare(value: number | null, old: number | null, points = false): PerformanceChange {
    const kind = points ? 'points' as const : 'percent' as const
    if (value === null || old === null) return { value, previous: old, change: null, kind, status: 'MISSING_COST' }
    if (coverage !== 'DOWNLOADED') return { value, previous: previous ? old : null, change: null, kind, status: 'NO_HISTORY' }
    // No row does not prove zero financial activity for an individual product.
    if (!previous) return { value, previous: null, change: null, kind, status: 'NO_BASELINE' }
    if (!points && old === 0) return { value, previous: old, change: null, kind, status: 'ZERO_BASELINE' }
    return { value, previous: old, change: round(points ? value - old : (value - old) / Math.abs(old) * 100), kind, status: 'AVAILABLE' }
  }
  const profit = current.missingCost ? null : current.profitBeforeAds
  const oldProfit = previous?.missingCost ? null : previous?.profitBeforeAds ?? 0
  return {
    sales: compare(current.grossSales, previous?.grossSales ?? 0),
    proceeds: compare(productProceeds(current), previous ? productProceeds(previous) : 0),
    units: compare(current.soldQuantity, previous?.soldQuantity ?? 0),
    orders: compare(current.orders.length, previous?.orders.length ?? 0),
    profit: compare(profit, oldProfit),
    margin: compare(profit === null ? null : current.grossSales ? round(profit / current.grossSales * 100) : 0,
      oldProfit === null ? null : previous?.grossSales ? round(oldProfit / previous.grossSales * 100) : 0, true),
    returnRate: compare(current.returnRate, previous?.returnRate ?? 0, true),
  }
}
/** Reusable product figures; UI components only select and format these values. */
export function productPerformanceFigures(product: SkuProfitSummary) {
  const refunds = round((product.customerRefunds ?? product.orders.reduce((total, order) => total + order.refunds, 0)))
  return {
    proceeds: productProceeds(product), refunds, units: product.soldQuantity, orders: product.orders.length,
    fees: product.marketplaceCharges, shipping: product.shippingFees, reimbursements: product.reimbursements,
    costs: product.missingCost ? null : product.netCogs,
    margin: product.missingCost ? null : product.grossSales ? round(product.profitBeforeAds / product.grossSales * 100) : null,
  }
}

/** Both sides need observed source windows; later linked financial history can still evolve. */
export function productComparisonHistoryCoverage(current: DateRange | undefined, previous: DateRange | undefined, financial: readonly SyncRange[] | undefined, purchases: readonly SyncRange[] | undefined, utcOffsetMinutes = 0): HistoryCoverage {
  const states = [productHistoryCoverage(current, financial, purchases, utcOffsetMinutes), productHistoryCoverage(previous, financial, purchases, utcOffsetMinutes)]
  return states.includes('UNVERIFIED') ? 'UNVERIFIED' : states.includes('INCOMPLETE') ? 'INCOMPLETE' : 'DOWNLOADED'
}
