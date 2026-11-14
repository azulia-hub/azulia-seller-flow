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
export function productHistoryCoverage(range: DateRange | undefined, financial: readonly SyncRange[] | undefined, purchases: readonly SyncRange[] | undefined, utcOffsetMinutes = 0, observedThrough?:string): HistoryCoverage {
  if (!range || !financial || !purchases) return 'UNVERIFIED'
  const start = Date.parse(`${range.from}T00:00:00Z`) - utcOffsetMinutes * 60000
  const calendarEnd = Date.parse(`${range.to}T00:00:00Z`) - utcOffsetMinutes * 60000 + 86400000
  const cutoff=observedThrough?Date.parse(observedThrough):calendarEnd
  const end=Math.min(calendarEnd,cutoff)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return 'UNVERIFIED'
  const wanted = { from: new Date(start).toISOString(), to: new Date(end).toISOString() }
  return missingRanges(wanted, financial).length || missingRanges(wanted, purchases).length ? 'INCOMPLETE' : 'DOWNLOADED'
}
export function compareProductPerformance(current: SkuProfitSummary, previous: SkuProfitSummary | undefined, coverage: HistoryCoverage): ProductPerformance {
  function compare(value: number | null, old: number | null, points = false, hasDenominator = true, oldHasDenominator = true): PerformanceChange {
    const kind = points ? 'points' as const : 'percent' as const
    if (value === null || old === null) return { value, previous: old, change: null, kind, status: 'MISSING_COST' }
    if (coverage !== 'DOWNLOADED') return { value, previous: previous ? old : null, change: null, kind, status: 'NO_HISTORY' }
    // No row does not prove zero financial activity for an individual product.
    if (!previous) return { value, previous: null, change: null, kind, status: 'NO_BASELINE' }
    if (!points && old === 0) return { value, previous: old, change: null, kind, status: 'ZERO_BASELINE' }
    if (points && (!hasDenominator || !oldHasDenominator)) return { value, previous: oldHasDenominator ? old : null, change: null, kind, status: oldHasDenominator ? 'ZERO_BASELINE' : 'NO_BASELINE' }
    return { value, previous: old, change: round(points ? value - old : (value - old) / Math.abs(old) * 100), kind, status: 'AVAILABLE' }
  }
  const profit = current.missingCost ? null : current.profitBeforeAds
  const oldProfit = previous?.missingCost ? null : previous?.profitBeforeAds ?? 0
  const currentHasSales = current.grossSales > 0
  const previousHasSales = Boolean(previous && previous.grossSales > 0)
  const currentHasUnits = current.soldQuantity > 0
  const previousHasUnits = Boolean(previous && previous.soldQuantity > 0)
  return {
    sales: compare(current.grossSales, previous?.grossSales ?? 0),
    proceeds: compare(productProceeds(current), previous ? productProceeds(previous) : 0),
    units: compare(current.soldQuantity, previous?.soldQuantity ?? 0),
    orders: compare(current.orders.length, previous?.orders.length ?? 0),
    profit: compare(profit, oldProfit),
    margin: compare(
      profit === null ? null : currentHasSales ? round(profit / current.grossSales * 100) : 0,
      oldProfit === null ? null : previousHasSales ? round(oldProfit / previous!.grossSales * 100) : 0,
      true, currentHasSales, previousHasSales
    ),
    returnRate: compare(
      current.returnRate,
      previousHasUnits ? (previous?.returnRate ?? 0) : 0,
      true, currentHasUnits, previousHasUnits
    ),
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
export function productComparisonHistoryCoverage(current: DateRange | undefined, previous: DateRange | undefined, financial: readonly SyncRange[] | undefined, purchases: readonly SyncRange[] | undefined, utcOffsetMinutes = 0,observedThrough?:string): HistoryCoverage {
  const states = [productHistoryCoverage(current, financial, purchases, utcOffsetMinutes,observedThrough), productHistoryCoverage(previous, financial, purchases, utcOffsetMinutes)]
  return states.includes('UNVERIFIED') ? 'UNVERIFIED' : states.includes('INCOMPLETE') ? 'INCOMPLETE' : 'DOWNLOADED'
}

/** Use a completed common source horizon today, never the next midnight or an invented future window. */
export function comparisonObservationCutoff(financial:readonly SyncRange[]|undefined,purchases:readonly SyncRange[]|undefined,now:string,offsetMinutes=0):string|undefined{
  const time=Date.parse(now);if(!Number.isFinite(time)||!financial?.length||!purchases?.length)return undefined
  const high = (ranges: readonly SyncRange[]) => ranges.reduce((max, range) => {
    const t = Date.parse(range.to)
    return Number.isFinite(t) && t > max ? t : max
  }, Number.NEGATIVE_INFINITY)
  const horizon=Math.min(time,high(financial),high(purchases)),todayStart=Math.floor((time+offsetMinutes*60000)/86400000)*86400000-offsetMinutes*60000
  return Number.isFinite(horizon)&&horizon>todayStart?new Date(horizon).toISOString():undefined
}
