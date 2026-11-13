import type {
  CanonicalInventoryItem,
  ReplenishmentRecommendation,
  ReplenishmentUrgency,
} from './types'

export interface InventoryPortfolioSummary {
  readonly totalSkus: number
  readonly totalSellableUnits: number
  readonly totalInboundUnits: number
  readonly totalReservedUnits: number
  readonly totalUnsellableUnits: number
  readonly outOfStockCount: number
  readonly criticalReorderCount: number
  readonly reorderSoonCount: number
  readonly healthyCount: number
  readonly excessCount: number
  readonly unavailableCount: number
}

export function getReplenishmentBadgeMeta(urgency: ReplenishmentUrgency): {
  readonly label: string
  readonly tone: 'positive' | 'warning' | 'negative' | 'neutral'
  readonly description: string
} {
  switch (urgency) {
    case 'OUT_OF_STOCK':
      return {
        label: 'Out of stock',
        tone: 'negative',
        description: 'Zero sellable units available. Immediate stockout.',
      }
    case 'CRITICAL_REORDER':
      return {
        label: 'Critical reorder',
        tone: 'negative',
        description: 'Stock will deplete before an order placed today can arrive.',
      }
    case 'REORDER_SOON':
      return {
        label: 'Reorder soon',
        tone: 'warning',
        description: 'Stock has fallen below the reorder point (lead time + safety days).',
      }
    case 'HEALTHY':
      return {
        label: 'In stock',
        tone: 'positive',
        description: 'Inventory levels are within target cycle coverage.',
      }
    case 'EXCESS_STOCK':
      return {
        label: 'Excess stock',
        tone: 'neutral',
        description: 'Stock exceeds 1.5x of target cycle coverage; monitor storage fees.',
      }
    case 'UNAVAILABLE':
    default:
      return {
        label: 'Needs data',
        tone: 'neutral',
        description: 'Missing lead time, usable stock, or shipment demand history.',
      }
  }
}

export function summarizeInventoryPortfolio(
  items: readonly CanonicalInventoryItem[],
  recommendations: readonly ReplenishmentRecommendation[],
): InventoryPortfolioSummary {
  const recMap = new Map<string, ReplenishmentRecommendation>()
  for (const rec of recommendations) {
    recMap.set(JSON.stringify([rec.identity.sellerAccount,rec.identity.marketplace,rec.identity.sku,rec.identity.fulfillmentChannel]), rec)
  }

  let totalSellableUnits = 0
  let totalInboundUnits = 0
  let totalReservedUnits = 0
  let totalUnsellableUnits = 0

  let outOfStockCount = 0
  let criticalReorderCount = 0
  let reorderSoonCount = 0
  let healthyCount = 0
  let excessCount = 0
  let unavailableCount = 0

  for (const item of items) {
    if (typeof item.quantities.available === 'number') {
      totalSellableUnits += Math.max(0, item.quantities.available)
    }
    if (typeof item.quantities.inbound === 'number') {
      totalInboundUnits += Math.max(0, item.quantities.inbound)
    }
    if (typeof item.quantities.reserved === 'number') {
      totalReservedUnits += Math.max(0, item.quantities.reserved)
    }
    if (typeof item.quantities.unsellable === 'number') {
      totalUnsellableUnits += Math.max(0, item.quantities.unsellable)
    }

    const rec = recMap.get(JSON.stringify([item.sellerAccount,item.marketplace,item.sku,item.fulfillmentChannel]))
    const urgency = rec?.urgency ?? 'UNAVAILABLE'

    switch (urgency) {
      case 'OUT_OF_STOCK':
        outOfStockCount++
        break
      case 'CRITICAL_REORDER':
        criticalReorderCount++
        break
      case 'REORDER_SOON':
        reorderSoonCount++
        break
      case 'HEALTHY':
        healthyCount++
        break
      case 'EXCESS_STOCK':
        excessCount++
        break
      case 'UNAVAILABLE':
      default:
        unavailableCount++
        break
    }
  }

  return {
    totalSkus: items.length,
    totalSellableUnits,
    totalInboundUnits,
    totalReservedUnits,
    totalUnsellableUnits,
    outOfStockCount,
    criticalReorderCount,
    reorderSoonCount,
    healthyCount,
    excessCount,
    unavailableCount,
  }
}
