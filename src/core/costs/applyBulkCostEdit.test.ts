import { describe, expect, it } from 'vitest'
import { applyBulkCostEdit, previewBulkCostEdit } from './applyBulkCostEdit'

const costs = [
  { sku: 'A', unitCost: 100, effectiveFrom: null, updatedAt: 'old' },
  { sku: 'B', unitCost: 200, effectiveFrom: null, updatedAt: 'old' },
]

describe('bulk cost editing', () => {
  it('creates a shared dated period using percentage adjustments', () => {
    const result = applyBulkCostEdit(costs, { skus: ['A', 'B'], mode: 'INCREASE_PERCENT', value: 10, effectiveFrom: '2026-09-01', overwriteConflicts: false })
    expect(result.valid).toBe(true)
    expect(result.changes.map(change => change.nextCost)).toEqual([110, 220])
    expect(result.costs).toHaveLength(4)
  })

  it('blocks conflicting periods until overwrite is explicit', () => {
    const result = applyBulkCostEdit(costs, { skus: ['A'], mode: 'SET', value: 90, effectiveFrom: null, overwriteConflicts: false })
    expect(result).toMatchObject({ valid: false, conflicts: ['A'] })
    expect(result.costs).toBe(costs)
  })

  it('does not silently calculate a percentage without a base cost', () => {
    const result = applyBulkCostEdit([], { skus: ['A'], mode: 'DECREASE_PERCENT', value: 5, effectiveFrom: '2026-09-01', overwriteConflicts: false })
    expect(result).toMatchObject({ valid: false, missingBaseSkus: ['A'] })
  })

  it('previews the resulting COGS impact from canonical events', () => {
    const events = [{ id: 'sale', source: 'x', sourceDatasetId: 'x', sourceRow: 1, date: '2026-09-02', orderId: '1', sku: 'A', event: 'SALE' as const, quantity: 2, amount: 300, amountClass: 'OPERATING' as const, amountType: 'PRODUCT_REVENUE' as const, state: null, city: null, status: null, rawType: '', rawDescription: null, classified: true, raw: {} }]
    expect(previewBulkCostEdit(events, costs, { skus: ['A'], mode: 'SET', value: 120, effectiveFrom: '2026-09-01', overwriteConflicts: false })).toMatchObject({ currentNetCogs: 200, nextNetCogs: 240, netCogsChange: 40 })
  })
})
