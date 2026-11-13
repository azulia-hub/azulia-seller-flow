import type {
  DemandConfidenceStatus,
  DemandMetrics,
  DemandWindowDays,
  ShippedDayPoint,
} from './types'

/**
 * Pure, deterministic demand calculation.
 *
 * Invariant rules:
 * - Based strictly on shipped units, never financial SALE entries or unconfirmed orders.
 * - Refunds/returns MUST NOT subtract from shipped customer demand.
 * - Zero demand produces a dailyDemand of 0, but stock-cover days must be null, never Infinity.
 * - Missing history is explicitly surfaced via coverageRatio and confidence status.
 * - Stockout bias is detected and flagged when sellable stock was 0 during observed days.
 */
export function calculateDemandMetrics(
  shippedPoints: readonly ShippedDayPoint[],
  windowDays: DemandWindowDays = 30,
): DemandMetrics {
  const notes: string[] = []

  if (!shippedPoints || shippedPoints.length === 0) {
    return {
      windowDays,
      observedDays: 0,
      coverageRatio: 0,
      totalShippedUnits: 0,
      dailyDemand: null,
      stockoutDaysCount: 0,
      hasStockoutBias: false,
      confidence: 'NO_DATA',
      notes: ['No shipment history recorded for this SKU in the requested window.'],
    }
  }

  // Deduplicate and aggregate multiple points for the same calendar date
  const unitsByDate = new Map<string, { shipped: number; isStocked: boolean }>()
  for (const point of shippedPoints) {
    if (!point.date) continue
    const dateKey = point.date.slice(0, 10)
    const existing = unitsByDate.get(dateKey)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !Number.isFinite(point.shippedUnits) || point.shippedUnits < 0) continue
    const positiveUnits = point.shippedUnits
    if (existing) {
      unitsByDate.set(dateKey, {
        shipped: existing.shipped + positiveUnits,
        // If any point on that day was stocked, consider the day stocked
        isStocked: existing.isStocked || point.isStocked !== false,
      })
    } else {
      unitsByDate.set(dateKey, {
        shipped: positiveUnits,
        isStocked: point.isStocked !== false,
      })
    }
  }

  const observedDays = unitsByDate.size
  if (observedDays === 0) {
    return {
      windowDays,
      observedDays: 0,
      coverageRatio: 0,
      totalShippedUnits: 0,
      dailyDemand: null,
      stockoutDaysCount: 0,
      hasStockoutBias: false,
      confidence: 'NO_DATA',
      notes: ['No valid dated shipment points found.'],
    }
  }

  let totalShippedUnits = 0
  let stockoutDaysCount = 0

  for (const day of unitsByDate.values()) {
    totalShippedUnits += day.shipped
    if (!day.isStocked) {
      stockoutDaysCount++
    }
  }

  const coverageRatio = Math.min(1, Math.round((observedDays / windowDays) * 100) / 100)
  const isPartial = observedDays < windowDays
  const hasStockoutBias = stockoutDaysCount > 0

  // Calculate daily demand over observed days (rounded to 3 decimal places)
  const rawDaily = totalShippedUnits / observedDays
  const dailyDemand = Math.round(rawDaily * 1000) / 1000

  if (hasStockoutBias) {
    notes.push(
      `Demand may be understated: product was out of stock on ${stockoutDaysCount} of ${observedDays} observed days.`,
    )
  }

  if (isPartial) {
    notes.push(
      `Partial history: ${observedDays} days observed out of requested ${windowDays}-day window (${Math.round(coverageRatio * 100)}% coverage).`,
    )
  }

  if (totalShippedUnits === 0) {
    notes.push(`Zero units shipped across all ${observedDays} observed days.`)
  }

  let confidence: DemandConfidenceStatus
  if (totalShippedUnits === 0) {
    confidence = 'NO_OBSERVED_SALES'
  } else if (hasStockoutBias) {
    confidence = 'STOCKOUT_BIASED'
  } else if (isPartial && coverageRatio < 0.7) {
    confidence = 'INSUFFICIENT_HISTORY'
  } else if (isPartial) {
    confidence = 'PARTIAL_COVERAGE'
  } else {
    confidence = 'HIGH_CONFIDENCE'
  }

  return {
    windowDays,
    observedDays,
    coverageRatio,
    totalShippedUnits,
    dailyDemand,
    stockoutDaysCount,
    hasStockoutBias,
    confidence,
    notes,
  }
}

/**
 * Filter and project orders into date-indexed shipment points for a target SKU.
 *
 * Invariant:
 * - Only confirmed shipped orders are recognized as fulfilled customer demand.
 * - Pending, unshipped, or canceled orders are excluded.
 * - Customer refunds do NOT reduce fulfilled shipped units.
 */
export function buildShippedPointsFromOrders(
  orders: readonly {
    readonly orderId: string
    readonly purchaseDate?: string | null
    readonly shippedDate?: string | null
    readonly status?: string | null
    readonly items?: readonly {
      readonly sku?: string | null
      readonly quantity?: number | null
    }[]
  }[],
  targetSku: string,
  windowDays: DemandWindowDays = 30,
  anchorDateIso?: string,
): ShippedDayPoint[] {
  if (!orders || orders.length === 0 || !targetSku) return []

  if (!anchorDateIso) return []
  const anchor = new Date(anchorDateIso)
  const cutoffTime = anchor.getTime() - windowDays * 86400000

  const dailyCounts = new Map<string, number>()

  for (const order of orders) {
    const rawStatus = (order.status || '').toLowerCase()
    // Exclude orders that were canceled, pending authorization, or unshipped
    if (!['shipped', 'delivered'].includes(rawStatus)) {
      continue
    }

    // Prefer explicit shipped date; fallback to purchase date if status confirms shipment
    const effectiveDateStr = order.shippedDate || order.purchaseDate
    if (!effectiveDateStr) continue

    const parsedTime = Date.parse(effectiveDateStr)
    if (!Number.isFinite(parsedTime) || parsedTime < cutoffTime || parsedTime > anchor.getTime()) continue

    const dateKey = effectiveDateStr.slice(0, 10)

    for (const item of order.items || []) {
      if (!item.sku || item.sku.trim() !== targetSku.trim()) continue
      if (item.quantity === null || item.quantity === undefined || !Number.isFinite(item.quantity) || item.quantity < 0) continue
      const quantity = item.quantity
      dailyCounts.set(dateKey, (dailyCounts.get(dateKey) || 0) + quantity)
    }
  }

  return [...dailyCounts.entries()]
    .map(([date, shippedUnits]) => ({
      date,
      shippedUnits,
      isStocked: true,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
