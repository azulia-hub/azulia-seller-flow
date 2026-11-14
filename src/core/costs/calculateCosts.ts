import type { CanonicalFinancialEvent } from '../data/types'
import type { ProductCost } from './types'
import { canonicalDateKey } from '../analytics/dashboardSummary'
import { calculateRecoveryCost, type ReturnInspectionRecord } from '../return-recovery'

export type MissingCostPolicy = 'BLOCK' | 'ASSUME_ZERO'

export interface AppliedProductCost { readonly eventId: string; readonly sku: string; readonly eventDate: string | null; readonly costDate: string | null; readonly unitCost: number; readonly quantity: number; readonly cogs: number; readonly fallback: boolean }

export type ProductCostResolver = (sku: string, date: string | null) => ProductCost | undefined

function findInspection(
  inspections: ReadonlyMap<string, ReturnInspectionRecord> | Record<string, ReturnInspectionRecord>,
  orderId: string,
  sku: string
): ReturnInspectionRecord | undefined {
  if (inspections instanceof Map) {
    for (const record of inspections.values()) {
      if (record.identity.orderId === orderId && record.identity.sku === sku) return record
    }
    return inspections.get(orderId)
  }
  for (const record of Object.values(inspections)) {
    if (record?.identity?.orderId === orderId && record?.identity?.sku === sku) return record
  }
  return (inspections as Record<string, ReturnInspectionRecord>)[orderId]
}

/** One immutable-input lookup index per analysis; no shared mutable analytics state. */
export function createProductCostResolver(costs: readonly ProductCost[], normalizeSku: (sku: string) => string = value => value): ProductCostResolver {
  const groups = new Map<string, { dated: ProductCost[]; fallback?: ProductCost }>()
  const key = (sku: string) => normalizeSku(sku).trim().toLocaleLowerCase()
  for (const cost of costs) {
    const identity = key(cost.sku)
    const group = groups.get(identity) ?? { dated: [] }
    if (cost.effectiveFrom) group.dated.push(cost)
    else if (!group.fallback || cost.updatedAt.localeCompare(group.fallback.updatedAt) > 0) group.fallback = cost
    groups.set(identity, group)
  }
  for (const group of groups.values()) group.dated.sort((a, b) => (b.effectiveFrom ?? '').localeCompare(a.effectiveFrom ?? ''))
  return (sku, date) => {
    const group = groups.get(key(sku))
    if (!group) return undefined
    if (date) {
      let low = 0, high = group.dated.length
      while (low < high) { const mid = (low + high) >>> 1; if (group.dated[mid].effectiveFrom! > date) low = mid + 1; else high = mid }
      if (low < group.dated.length) return group.dated[low]
    }
    return group.fallback
  }
}

export function resolveProductCost(costs: readonly ProductCost[], sku: string, date: string | null, normalizeSku: (sku: string) => string = value => value): ProductCost | undefined {
  return createProductCostResolver(costs, normalizeSku)(sku, date)
}

export function calculateCosts(
  events: readonly CanonicalFinancialEvent[],
  costs: readonly ProductCost[],
  policy: MissingCostPolicy = 'BLOCK',
  normalizeSku: (sku: string) => string = (sku) => sku,
  resolveCost: ProductCostResolver = createProductCostResolver(costs, normalizeSku),
  inspections?: ReadonlyMap<string, ReturnInspectionRecord> | Record<string, ReturnInspectionRecord>
) {
  const skuKey = (sku: string) => normalizeSku(sku).trim().toLocaleLowerCase()
  const inventoryEvents = events.filter((event) => event.sku && event.amountType === 'PRODUCT_REVENUE' && (event.event === 'SALE' || event.event === 'REFUND'))
  const requiredSkus = [...new Set(inventoryEvents.flatMap((event) => event.sku ? [event.sku] : []))].sort()
  const saleDates = new Map<string, string>()
  inventoryEvents.filter(event => event.event === 'SALE' && event.orderId && event.sku).forEach(event => { const date = canonicalDateKey(event.orderPurchaseDate === undefined ? event.date : event.orderPurchaseDate); if (date) saleDates.set(`${event.orderId}\u001f${skuKey(event.sku!)}`, date) })
  const appliedCosts: AppliedProductCost[] = []
  const missingEvents: CanonicalFinancialEvent[] = []
  const netCogs = inventoryEvents.reduce((total, event) => {
    const eventDate = canonicalDateKey(event.date)
    const originDate = event.orderPurchaseDate === undefined ? eventDate : canonicalDateKey(event.orderPurchaseDate)
    const costDate = event.event === 'REFUND' && event.orderId && event.sku ? saleDates.get(`${event.orderId}\u001f${skuKey(event.sku)}`) ?? originDate : originDate
    const cost = event.sku ? resolveCost(event.sku, costDate) : undefined
    if (!cost) { missingEvents.push(event); return total }
    const quantity = event.quantity ?? 0
    let cogs: number
    if (event.event === 'REFUND') {
      if (inspections && event.orderId && event.sku) {
        const inspection = findInspection(inspections, event.orderId, event.sku)
        if (inspection) {
          const recovery = calculateRecoveryCost({
            identity: inspection.identity,
            returnedQuantity: quantity,
            unitCost: cost.unitCost,
            inspection,
          })
          cogs = -(recovery.confirmedRecoveredCost - recovery.totalRepairExpense)
        } else {
          // Unconfirmed recovery remains provisional: original consumed product cost is retained
          cogs = 0
        }
      } else if (inspections) {
        cogs = 0
      } else {
        cogs = -quantity * cost.unitCost
      }
    } else {
      cogs = quantity * cost.unitCost
    }
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
