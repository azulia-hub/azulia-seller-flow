import { describe, expect, it } from 'vitest'
import { computeLandedUnitCost } from './landedCost'

describe('landed cost computation', () => {
  it('returns fallback when no breakdown fields are provided', () => {
    expect(computeLandedUnitCost({}, 150)).toBe(150)
  })

  it('aggregates purchase, packaging, and freight while deducting tax credit offset', () => {
    const cost = computeLandedUnitCost({
      purchaseCost: 200,
      packagingCost: 15.5,
      freightCost: 12.25,
      taxCreditOffset: 8.75,
    })
    // 200 + 15.5 + 12.25 - 8.75 = 219.00
    expect(cost).toBe(219)
  })

  it('handles null or missing components safely', () => {
    expect(computeLandedUnitCost({ purchaseCost: 100, packagingCost: null })).toBe(100)
    expect(computeLandedUnitCost({ purchaseCost: 50, freightCost: 10 })).toBe(60)
  })

  it('never returns negative cost even if tax credit exceeds purchase', () => {
    expect(computeLandedUnitCost({ purchaseCost: 10, taxCreditOffset: 25 })).toBe(0)
  })
})
