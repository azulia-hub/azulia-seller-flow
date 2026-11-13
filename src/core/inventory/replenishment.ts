import type {
  CanonicalInventoryItem,
  DemandMetrics,
  ReplenishmentConfig,
  ReplenishmentRecommendation,
  ReplenishmentUrgency,
} from './types'

/**
 * Pure, deterministic replenishment recommendation engine.
 *
 * Invariant rules:
 * - Mathematical precision:
 *     Reorder point = daily demand * (lead time + safety days).
 *     Target stock = daily demand * (lead time + safety days + coverage days).
 *     Suggested quantity = max(0, target stock - usable stock - qualifying inbound).
 * - Minimum order quantity (MOQ) and pack multiple rounding apply ONLY when suggested quantity > 0.
 * - Reserved stock is NEVER subtracted twice (fulfillable available stock is already net of reserved).
 * - Zero demand produces a stockCoverDays of null (NEVER Infinity).
 * - Unknown required quantities or invalid parameters produce urgency: 'UNAVAILABLE' with explicit reasons.
 */

export const DEFAULT_REPLENISHMENT_CONFIG: ReplenishmentConfig = {
  leadTimeDays: 14,
  safetyStockDays: 7,
  replenishmentCoverageDays: 30,
  minOrderQuantity: 0,
  packMultiple: 1,
  includeInboundShipped: false,
  includeInboundReceiving: false,
  includeInboundWorking: false,
  includeManualPhysical: false,
}

/**
 * Calculate qualifying inbound stock based on configuration rules.
 * Does not double-count total inbound if breakdown fields are used.
 */
export function calculateQualifyingInbound(
  item: CanonicalInventoryItem,
  config: ReplenishmentConfig,
): number | null {
  if (!config.includeInboundShipped && !config.includeInboundReceiving && !config.includeInboundWorking) return 0
  if (!config.inboundArrivalConfirmed) return null
  const breakdown = item.quantities.inboundBreakdown
  if (breakdown) {
    if ((config.includeInboundShipped && breakdown.shipped === null) || (config.includeInboundReceiving && breakdown.receiving === null) || (config.includeInboundWorking && breakdown.working === null)) return null
    let qualifying = 0
    if (config.includeInboundShipped && typeof breakdown.shipped === 'number') {
      qualifying += Math.max(0, breakdown.shipped)
    }
    if (config.includeInboundReceiving && typeof breakdown.receiving === 'number') {
      qualifying += Math.max(0, breakdown.receiving)
    }
    if (config.includeInboundWorking && typeof breakdown.working === 'number') {
      qualifying += Math.max(0, breakdown.working)
    }
    return qualifying
  }

  // Fallback to top-level inbound count if no breakdown is provided
  // By default, top-level inbound is treated as qualifying if includeInboundShipped is enabled
  if (config.includeInboundShipped && typeof item.quantities.inbound === 'number') {
    return Math.max(0, item.quantities.inbound)
  }

  return null
}

/**
 * Determine sellable usable stock on hand.
 *
 * Invariant: FBA 'available' is already unreserved sellable stock.
 * We strictly do NOT subtract reserved quantities again.
 */
export function calculateUsableStock(
  item: CanonicalInventoryItem,
  config: ReplenishmentConfig,
): number | null {
  if (item.stockBasis === 'MANUAL_PHYSICAL') {
    const physical = item.quantities.manualPhysical
    return physical !== null && Number.isFinite(physical) && physical >= 0 ? physical : null
  }
  const available = item.quantities.available
  if (available === null || available === undefined || !Number.isFinite(available)) {
    return null
  }

  let usable = Math.max(0, available)
  if (config.includeManualPhysical && typeof item.quantities.manualPhysical === 'number') {
    usable += Math.max(0, item.quantities.manualPhysical)
  }

  return usable
}

export function computeReplenishment(
  item: CanonicalInventoryItem,
  demand: DemandMetrics,
  configInput: Partial<ReplenishmentConfig> = {},
  nowIso = item.updatedAt,
): ReplenishmentRecommendation {
  const config: ReplenishmentConfig = {
    ...DEFAULT_REPLENISHMENT_CONFIG,
    ...configInput,
  }

  const unavailableReasons: string[] = []

  // Validate parameters
  if (!Number.isFinite(config.leadTimeDays) || config.leadTimeDays < 0) {
    unavailableReasons.push(`Invalid lead time: ${config.leadTimeDays} days. Must be >= 0.`)
  }
  if (!Number.isFinite(config.safetyStockDays) || config.safetyStockDays < 0) {
    unavailableReasons.push(`Invalid safety stock days: ${config.safetyStockDays}. Must be >= 0.`)
  }
  if (!Number.isFinite(config.replenishmentCoverageDays) || config.replenishmentCoverageDays <= 0) {
    unavailableReasons.push(
      `Invalid replenishment coverage days: ${config.replenishmentCoverageDays}. Must be > 0.`,
    )
  }

  const usableStock = calculateUsableStock(item, config)
  if (usableStock === null) {
    unavailableReasons.push(
      'Usable sellable stock is unknown (available inventory is null from source).',
    )
  }

  const dailyDemand = demand.dailyDemand
  if (dailyDemand === null || !Number.isFinite(dailyDemand) || dailyDemand < 0) {
    unavailableReasons.push(
      'Daily demand is unknown (no observed shipment data in the selected window).',
    )
  }

  const identity = {
    sellerAccount: item.sellerAccount,
    marketplace: item.marketplace,
    sku: item.sku,
    fulfillmentChannel: item.fulfillmentChannel,
  }

  if (config.minOrderQuantity !== undefined && (!Number.isSafeInteger(config.minOrderQuantity) || config.minOrderQuantity < 0)) unavailableReasons.push('Minimum order quantity must be a nonnegative integer.')
  if (config.packMultiple !== undefined && (!Number.isSafeInteger(config.packMultiple) || config.packMultiple < 1)) unavailableReasons.push('Pack multiple must be a positive integer.')
  const qualifyingInbound = calculateQualifyingInbound(item, config)
  if (qualifyingInbound === null) unavailableReasons.push('Selected inbound quantities or their arrival assumption are not confirmed.')

  // If any critical required input is missing, return UNAVAILABLE recommendation
  if (unavailableReasons.length > 0 || usableStock === null || dailyDemand === null || qualifyingInbound === null) {
    return {
      sku: item.sku,
      identity,
      usableStock,
      qualifyingInbound,
      dailyDemand,
      stockCoverDays: null,
      reorderPoint: null,
      targetStock: null,
      rawSuggestedQuantity: null,
      suggestedQuantity: null,
      daysUntilStockout: null,
      urgency: 'UNAVAILABLE',
      unavailableReasons,
      calculationTimestamp: nowIso,
    }
  }

  // 1. Stock cover days:
  // Invariant: Zero demand must NOT produce infinite stock-cover days.
  let stockCoverDays: number | null = null
  let daysUntilStockout: number | null = null

  if (dailyDemand > 0) {
    stockCoverDays = Math.round((usableStock / dailyDemand) * 10) / 10
    daysUntilStockout = Math.round(((usableStock + qualifyingInbound) / dailyDemand) * 10) / 10
  } else {
    // dailyDemand is 0: explicit null to avoid division by zero
    stockCoverDays = null
    daysUntilStockout = null
  }

  // 2. Reorder point & Target stock:
  const leadAndSafetyDays = config.leadTimeDays + config.safetyStockDays
  const reorderPoint = Math.ceil(dailyDemand * leadAndSafetyDays)

  const totalCycleDays = leadAndSafetyDays + config.replenishmentCoverageDays
  const targetStock = Math.ceil(dailyDemand * totalCycleDays)

  // 3. Raw suggested quantity:
  // targetStock - usableStock - qualifyingInbound
  const netDeficit = targetStock - usableStock - qualifyingInbound
  const rawSuggestedQuantity = Math.max(0, netDeficit)

  // 4. Batch & Pack rounding rules:
  // Invariant: Apply minimum quantity and pack rounding ONLY for positive suggestions.
  let suggestedQuantity = 0

  if (rawSuggestedQuantity > 0) {
    suggestedQuantity = rawSuggestedQuantity

    // Apply minimum order quantity (MOQ)
    const moq = Math.max(0, config.minOrderQuantity ?? 0)
    if (suggestedQuantity < moq) {
      suggestedQuantity = moq
    }

    // Apply pack multiple (e.g. box of 12)
    const packMultiple = Math.max(1, Math.floor(config.packMultiple ?? 1))
    if (packMultiple > 1) {
      suggestedQuantity = Math.ceil(suggestedQuantity / packMultiple) * packMultiple
    }
  }

  // 5. Urgency classification:
  let urgency: ReplenishmentUrgency
  if (usableStock <= 0) {
    urgency = 'OUT_OF_STOCK'
  } else if (dailyDemand > 0 && usableStock <= dailyDemand * config.leadTimeDays) {
    // Current stock will deplete before a fresh order can arrive even without buffer
    urgency = 'CRITICAL_REORDER'
  } else if (usableStock <= reorderPoint) {
    urgency = 'REORDER_SOON'
  } else if (dailyDemand > 0 && usableStock > targetStock * 1.5) {
    urgency = 'EXCESS_STOCK'
  } else {
    urgency = 'HEALTHY'
  }

  return {
    sku: item.sku,
    identity,
    usableStock,
    qualifyingInbound,
    dailyDemand,
    stockCoverDays,
    reorderPoint,
    targetStock,
    rawSuggestedQuantity,
    suggestedQuantity,
    daysUntilStockout,
    urgency,
    unavailableReasons,
    calculationTimestamp: nowIso,
  }
}
