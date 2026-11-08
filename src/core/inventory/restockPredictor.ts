import type { CanonicalFinancialEvent } from '../data/types'
import { canonicalDateKey } from '../analytics/dashboardSummary'

export type RestockUrgency = 'OUT_OF_STOCK' | 'REORDER_NOW' | 'REORDER_SOON' | 'HEALTHY'

export interface SkuRestockStatus {
  readonly sku: string
  readonly currentStock: number
  readonly velocity7d: number
  readonly velocity30d: number
  readonly activeVelocity: number
  readonly daysOfStock: number
  readonly urgency: RestockUrgency
  readonly estimatedStockoutDate: string | null
  readonly recommendedReorderQty: number
}

export interface RestockPredictorInput {
  readonly events: readonly CanonicalFinancialEvent[]
  readonly stockLevels?: Readonly<Record<string, number>>
  readonly leadTimeDays?: number
  readonly anchorDate?: string
}

export function predictInventoryRestock(input: RestockPredictorInput): SkuRestockStatus[] {
  const anchorDate = input.anchorDate ?? new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
  const anchorTime = Date.parse(`${anchorDate}T00:00:00Z`)
  const leadTimeDays = input.leadTimeDays ?? 10
  const stockMap = input.stockLevels ?? {}

  const date7d = new Date(anchorTime - 7 * 86400000).toISOString().slice(0, 10)
  const date30d = new Date(anchorTime - 30 * 86400000).toISOString().slice(0, 10)

  const units7dBySku = new Map<string, number>()
  const units30dBySku = new Map<string, number>()
  const allSkus = new Set<string>(Object.keys(stockMap))

  for (const event of input.events) {
    if (!event.sku || event.event !== 'SALE' || event.amountType !== 'PRODUCT_REVENUE') continue
    const dateKey = canonicalDateKey(event.date)
    if (!dateKey) continue

    allSkus.add(event.sku)
    const qty = event.quantity ?? 1

    if (dateKey >= date7d && dateKey <= anchorDate) {
      units7dBySku.set(event.sku, (units7dBySku.get(event.sku) ?? 0) + qty)
    }
    if (dateKey >= date30d && dateKey <= anchorDate) {
      units30dBySku.set(event.sku, (units30dBySku.get(event.sku) ?? 0) + qty)
    }
  }

  const results: SkuRestockStatus[] = []

  for (const sku of allSkus) {
    const u7 = units7dBySku.get(sku) ?? 0
    const u30 = units30dBySku.get(sku) ?? 0
    const velocity7d = Math.round((u7 / 7) * 100) / 100
    const velocity30d = Math.round((u30 / 30) * 100) / 100
    const activeVelocity = velocity7d > 0 ? velocity7d : velocity30d

    // Default stock heuristic if not provided
    const currentStock = stockMap[sku] !== undefined ? stockMap[sku] : Math.max(0, u30 * 2)

    const daysOfStock = activeVelocity > 0 ? Math.floor(currentStock / activeVelocity) : 999
    let urgency: RestockUrgency = 'HEALTHY'
    let estimatedStockoutDate: string | null = null

    if (currentStock <= 0 && activeVelocity > 0) {
      urgency = 'OUT_OF_STOCK'
      estimatedStockoutDate = anchorDate
    } else if (daysOfStock <= leadTimeDays) {
      urgency = 'REORDER_NOW'
      estimatedStockoutDate = new Date(anchorTime + daysOfStock * 86400000).toISOString().slice(0, 10)
    } else if (daysOfStock <= leadTimeDays * 1.8) {
      urgency = 'REORDER_SOON'
      estimatedStockoutDate = new Date(anchorTime + daysOfStock * 86400000).toISOString().slice(0, 10)
    }

    const recommendedReorderQty = activeVelocity > 0
      ? Math.max(0, Math.ceil(activeVelocity * (leadTimeDays + 14)) - currentStock)
      : 0

    results.push({
      sku,
      currentStock,
      velocity7d,
      velocity30d,
      activeVelocity,
      daysOfStock,
      urgency,
      estimatedStockoutDate,
      recommendedReorderQty,
    })
  }

  const urgencyRank: Record<RestockUrgency, number> = {
    OUT_OF_STOCK: 0,
    REORDER_NOW: 1,
    REORDER_SOON: 2,
    HEALTHY: 3,
  }

  return results.sort((a, b) => urgencyRank[a.urgency] - urgencyRank[b.urgency] || a.daysOfStock - b.daysOfStock)
}
