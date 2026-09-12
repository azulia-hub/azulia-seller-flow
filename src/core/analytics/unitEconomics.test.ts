import { describe, expect, it } from 'vitest'
import { calculateUnitEconomics } from './unitEconomics'

describe('unit economics', () => {
  it('calculates after-ad profit per delivered unit and pre-ad break-even TACOS', () => {
    expect(calculateUnitEconomics({ grossSales: 1000, netDeliveredQuantity: 8, profitAfterAds: 160, adsSpend: 40, profitReady: true })).toEqual({ profitPerDeliveredUnit: 20, breakEvenTacos: 20, maximumAffordableAds: 200 })
  })

  it('returns unavailable ratios when cost or denominators are incomplete', () => {
    expect(calculateUnitEconomics({ grossSales: 1000, netDeliveredQuantity: 8, profitAfterAds: 160, adsSpend: 40, profitReady: false })).toEqual({ profitPerDeliveredUnit: null, breakEvenTacos: null, maximumAffordableAds: null })
    expect(calculateUnitEconomics({ grossSales: 0, netDeliveredQuantity: 0, profitAfterAds: 0, adsSpend: 0, profitReady: true })).toEqual({ profitPerDeliveredUnit: null, breakEvenTacos: null, maximumAffordableAds: 0 })
  })
})
