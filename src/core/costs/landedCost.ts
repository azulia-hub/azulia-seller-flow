import type { LandedCostBreakdown } from './types'

/** Calculates total landed unit cost from component manufacturing, packaging, inbound freight and tax credit offsets. */
export function computeLandedUnitCost(breakdown: LandedCostBreakdown, fallback = 0): number {
  const { purchaseCost, packagingCost, freightCost, taxCreditOffset } = breakdown
  if (purchaseCost === undefined && packagingCost === undefined && freightCost === undefined && taxCreditOffset === undefined) {
    return fallback
  }
  const total = (Number(purchaseCost) || 0) + (Number(packagingCost) || 0) + (Number(freightCost) || 0) - (Number(taxCreditOffset) || 0)
  return Math.max(0, Math.round(total * 100) / 100)
}
