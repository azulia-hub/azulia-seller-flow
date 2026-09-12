export interface UnitEconomicsInput {
  readonly grossSales: number
  readonly netDeliveredQuantity: number
  readonly profitAfterAds: number
  readonly adsSpend: number
  readonly profitReady: boolean
}

export interface UnitEconomicsSummary {
  readonly profitPerDeliveredUnit: number | null
  readonly breakEvenTacos: number | null
  readonly maximumAffordableAds: number | null
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export function calculateUnitEconomics(input: UnitEconomicsInput): UnitEconomicsSummary {
  if (!input.profitReady) return { profitPerDeliveredUnit: null, breakEvenTacos: null, maximumAffordableAds: null }
  const profitBeforeAds = input.profitAfterAds + input.adsSpend
  return {
    profitPerDeliveredUnit: input.netDeliveredQuantity > 0 ? round(input.profitAfterAds / input.netDeliveredQuantity) : null,
    breakEvenTacos: input.grossSales > 0 ? round(Math.max(0, profitBeforeAds / input.grossSales * 100)) : null,
    maximumAffordableAds: round(Math.max(0, profitBeforeAds)),
  }
}
