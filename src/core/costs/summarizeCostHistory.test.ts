import { describe, expect, it } from 'vitest'
import { summarizeCostHistory } from './summarizeCostHistory'

describe('cost history summary', () => {
  it('orders periods and calculates the cost change', () => {
    expect(summarizeCostHistory([
      { sku: 'A', unitCost: 15, effectiveFrom: '2026-07-01', updatedAt: '' },
      { sku: 'A', unitCost: 10, effectiveFrom: '2026-01-01', updatedAt: '' },
    ])).toEqual([{ sku: 'A', points: [
      { effectiveFrom: '2026-01-01', unitCost: 10 },
      { effectiveFrom: '2026-07-01', unitCost: 15 },
    ], currentCost: 15, absoluteChange: 5, changePercent: 50 }])
  })
})
