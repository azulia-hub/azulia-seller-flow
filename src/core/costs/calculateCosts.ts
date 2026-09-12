import type { CanonicalFinancialEvent } from '../data/types'
import type { ProductCost } from './types'
import { canonicalDateKey } from '../analytics/dashboardSummary'

export type MissingCostPolicy = 'BLOCK' | 'ASSUME_ZERO'

export interface AppliedProductCost { readonly eventId: string; readonly sku: string; readonly eventDate: string | null; readonly costDate: string | null; readonly unitCost: number; readonly quantity: number; readonly cogs: number; readonly fallback: boolean }

export function resolveProductCost(costs: readonly ProductCost[], sku: string, date: string | null, normalizeSku: (sku: string) => string = value => value): ProductCost | undefined {
  const skuKey = (sku: string) => normalizeSku(sku).trim().toLocaleLowerCase()
  const candidates = costs.filter(cost => skuKey(cost.sku) === skuKey(sku))
  const dated = candidates.filter(cost => cost.effectiveFrom && date && cost.effectiveFrom <= date).sort((a, b) => (b.effectiveFrom ?? '').localeCompare(a.effectiveFrom ?? ''))
  return dated[0] ?? candidates.filter(cost => !cost.effectiveFrom).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
}

export function calculateCosts(events: readonly CanonicalFinancialEvent[], costs: readonly ProductCost[], policy: MissingCostPolicy = 'BLOCK', normalizeSku: (sku: string) => string = (sku) => sku) {
  const skuKey = (sku: string) => normalizeSku(sku).trim().toLocaleLowerCase()
  const inventoryEvents = events.filter((event) => event.sku && event.amountType === 'PRODUCT_REVENUE' && (event.event === 'SALE' || event.event === 'REFUND'))
  const requiredSkus = [...new Set(inventoryEvents.flatMap((event) => event.sku ? [event.sku] : []))].sort()
  const saleDates = new Map<string, string>()
  inventoryEvents.filter(event => event.event === 'SALE' && event.orderId && event.sku).forEach(event => { const date = canonicalDateKey(event.date); if (date) saleDates.set(`${event.orderId}\u001f${skuKey(event.sku!)}`, date) })
  const appliedCosts: AppliedProductCost[] = []
  const missingEvents: CanonicalFinancialEvent[] = []
  const netCogs = inventoryEvents.reduce((total, event) => {
    const eventDate = canonicalDateKey(event.date)
    const costDate = event.event === 'REFUND' && event.orderId && event.sku ? saleDates.get(`${event.orderId}\u001f${skuKey(event.sku)}`) ?? eventDate : eventDate
    const cost = event.sku ? resolveProductCost(costs, event.sku, costDate, normalizeSku) : undefined
    if (!cost) { missingEvents.push(event); return total }
    const quantity = event.quantity ?? 0
    const cogs = (event.event === 'REFUND' ? -quantity : quantity) * cost.unitCost
    appliedCosts.push({ eventId: event.id, sku: event.sku!, eventDate, costDate: cost.effectiveFrom ?? null, unitCost: cost.unitCost, quantity, cogs: round(cogs), fallback: !cost.effectiveFrom })
    return total + cogs
  }, 0)
  const missingSkus = [...new Set(missingEvents.flatMap(event => event.sku ? [event.sku] : []))].sort()
  return {
    requiredSkus,
    missingSkus,
    coveredSkus: requiredSkus.length - missingSkus.length,
    coveragePercent: requiredSkus.length ? (requiredSkus.length - missingSkus.length) / requiredSkus.length * 100 : 100,
    netCogs: Math.round((netCogs + Number.EPSILON) * 100) / 100,
    complete: missingSkus.length === 0,
    profitReady: missingSkus.length === 0 || policy === 'ASSUME_ZERO',
    missingCostPolicy: policy,
    missingEventCount: missingEvents.length,
    appliedCosts,
  }
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
