import { describe, expect, it } from 'vitest'
import type { CanonicalFinancialEvent } from '../data/types'
import { calculateCosts } from './calculateCosts'

const base = { source: 'x', sourceDatasetId: 'x', sourceRow: 1, date: null, orderId: null, sku: 'A', amountClass: 'OPERATING' as const, amountType: 'PRODUCT_REVENUE' as const, state: null, city: null, status: null, rawType: '', rawDescription: null, classified: true, raw: {} }
const events: CanonicalFinancialEvent[] = [
  { ...base, id: 'sale', event: 'SALE', quantity: 3, amount: 300 },
  { ...base, id: 'return', event: 'REFUND', quantity: 1, amount: -100 },
]

describe('cost calculation', () => {
  it('reverses COGS for a good return', () => {
    expect(calculateCosts(events, [{ sku: 'A', unitCost: 40, updatedAt: '' }])).toMatchObject({ netCogs: 80, complete: true })
  })
  it('never treats a missing cost as zero coverage', () => {
    expect(calculateCosts(events, [])).toMatchObject({ missingSkus: ['A'], coveragePercent: 0, complete: false, profitReady: false })
    expect(calculateCosts(events, [], 'ASSUME_ZERO')).toMatchObject({ missingSkus: ['A'], coveragePercent: 0, complete: false, profitReady: true, netCogs: 0 })
  })
  it('supports adapter-provided SKU identity normalization', () => {
    const normalize = (sku: string) => sku.replace(/-CHANNEL$/, '')
    expect(calculateCosts(events, [{ sku: 'A-CHANNEL', unitCost: 40, updatedAt: '' }], 'BLOCK', normalize)).toMatchObject({ netCogs: 80, complete: true })
  })

  it('uses the cost effective on each sale date', () => {
    const datedEvents: CanonicalFinancialEvent[] = [
      { ...base, id: 'old-sale', date: '2026-03-10', event: 'SALE', quantity: 1, amount: 100 },
      { ...base, id: 'new-sale', date: '2026-08-10', event: 'SALE', quantity: 2, amount: 200 },
    ]
    const result = calculateCosts(datedEvents, [
      { sku: 'A', unitCost: 20, effectiveFrom: '2026-01-01', updatedAt: '' },
      { sku: 'A', unitCost: 30, effectiveFrom: '2026-07-01', updatedAt: '' },
    ])
    expect(result.netCogs).toBe(80)
    expect(result.appliedCosts.map(({ eventId, unitCost }) => ({ eventId, unitCost }))).toEqual([
      { eventId: 'old-sale', unitCost: 20 },
      { eventId: 'new-sale', unitCost: 30 },
    ])
  })

  it('marks an event before the first dated cost as missing', () => {
    const result = calculateCosts(
      [{ ...base, id: 'early-sale', date: '2025-12-31', event: 'SALE', quantity: 1, amount: 100 }],
      [{ sku: 'A', unitCost: 20, effectiveFrom: '2026-01-01', updatedAt: '' }],
    )
    expect(result).toMatchObject({ netCogs: 0, missingSkus: ['A'], missingEventCount: 1, complete: false })
  })

  it('reverses a refund using the original sale-date cost', () => {
    const result = calculateCosts([
      { ...base, id: 'dated-sale', orderId: 'ORDER-1', date: '2026-03-10', event: 'SALE', quantity: 1, amount: 100 },
      { ...base, id: 'dated-refund', orderId: 'ORDER-1', date: '2026-08-10', event: 'REFUND', quantity: 1, amount: -100 },
    ], [
      { sku: 'A', unitCost: 20, effectiveFrom: '2026-01-01', updatedAt: '' },
      { sku: 'A', unitCost: 30, effectiveFrom: '2026-07-01', updatedAt: '' },
    ])
    expect(result.netCogs).toBe(0)
    expect(result.appliedCosts.map((item) => item.unitCost)).toEqual([20, 20])
  })
})
