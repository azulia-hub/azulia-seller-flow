import { describe, expect, it } from 'vitest'
import { setProductCost } from './setProductCost'
import { resolveProductCost } from './calculateCosts'
import type { ProductCost } from './types'
const costs: ProductCost[] = [{ sku: 'A', unitCost: 20, updatedAt: 'old' }, { sku: 'A', unitCost: 30, effectiveFrom: '2026-08-01', updatedAt: 'old' }, { sku: 'B', unitCost: 80, updatedAt: 'old' }]

describe('single-product cost entry', () => {
  it('replaces only the chosen normalized SKU period, preserving history and other products', () => {
    const next = setProductCost(costs, { sku: 'a-CHANNEL', unitCost: 25, updatedAt: 'new' }, value => value.replace(/-CHANNEL$/i, ''))
    expect(next).toHaveLength(3)
    expect(costs[0].unitCost).toBe(20)
    expect(next).toContain(costs[1]); expect(next).toContain(costs[2])
    expect(resolveProductCost(next, 'A', '2026-07-01', value => value.replace(/-CHANNEL$/i, ''))?.unitCost).toBe(25)
    expect(resolveProductCost(next, 'A', '2026-08-10', value => value.replace(/-CHANNEL$/i, ''))?.unitCost).toBe(30)
  })
  it('adds dated costs without filling earlier missing periods and permits an explicit zero', () => {
    const next = setProductCost([], { sku: 'A', unitCost: 0, effectiveFrom: '2026-08-01', updatedAt: 'new' })
    expect(resolveProductCost(next, 'A', '2026-07-01')).toBeUndefined()
    expect(resolveProductCost(next, 'A', '2026-08-01')?.unitCost).toBe(0)
  })
  it('rejects invalid money, missing identity and invalid effective dates', () => {
    for (const unitCost of [-1, NaN, Infinity]) expect(() => setProductCost(costs, { sku: 'A', unitCost, updatedAt: '' })).toThrow()
    for (const effectiveFrom of ['2026-02-30', '2026-13-01', 'bad-date']) expect(() => setProductCost(costs, { sku: 'A', unitCost: 10, effectiveFrom, updatedAt: '' })).toThrow()
    expect(() => setProductCost(costs, { sku: ' ', unitCost: 10, updatedAt: '' })).toThrow()
  })
})
