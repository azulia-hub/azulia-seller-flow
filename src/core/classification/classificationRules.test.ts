import { describe, expect, it } from 'vitest'
import type { CanonicalDataset, CanonicalFinancialEvent } from '../data/types'
import { applyClassificationRules, groupUnclassifiedEvents } from './classificationRules'

const event = (id: string, rawType: string, amount: number): CanonicalFinancialEvent => ({ id, source: 'market-a', sourceDatasetId: 'd1', sourceRow: 1, date: null, orderId: null, sku: null, event: 'UNKNOWN', quantity: null, amount, amountClass: 'OPERATING', amountType: 'UNKNOWN', state: null, city: null, status: null, rawType, rawDescription: 'Raw detail', classified: false, raw: {} })
const dataset = (events: CanonicalFinancialEvent[]): CanonicalDataset => ({ source: 'market-a', events, quality: { source: 'market-a', sourceRowCount: events.length, normalizedEventCount: events.length, unknownTransactionTypes: ['Mystery'], unclassifiedEventCount: events.length, missingKeys: { orderId: 0, sku: 0, date: 0 }, reconciliation: { supported: true, sourceTotal: events.reduce((sum, item) => sum + item.amount, 0), normalizedTotal: events.reduce((sum, item) => sum + item.amount, 0), difference: 0, reconciled: true } } })

describe('classification rules', () => {
  it('groups unresolved labels without losing their financial impact', () => {
    const groups = groupUnclassifiedEvents([event('1', 'Mystery', 100), event('2', ' mystery ', -25)])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ count: 2, amount: 75, rawType: 'Mystery' })
  })

  it('classifies matching events while preserving event count and money', () => {
    const input = dataset([event('1', 'Mystery', 100), event('2', 'Other mystery', -25)])
    const result = applyClassificationRules(input, [{ id: 'r1', source: 'market-a', rawType: 'MYSTERY', event: 'FEE', amountClass: 'OPERATING', amountType: 'OTHER_FEE', createdAt: '2026-09-05' }])
    expect(result.events).toHaveLength(2)
    expect(result.events.reduce((sum, item) => sum + item.amount, 0)).toBe(75)
    expect(result.events[0]).toMatchObject({ event: 'FEE', amountType: 'OTHER_FEE', classified: true })
    expect(result.quality.unclassifiedEventCount).toBe(1)
    expect(result.quality.reconciliation.reconciled).toBe(true)
  })

  it('keeps already-classified events unchanged', () => {
    const known = { ...event('1', 'Mystery', 10), event: 'SALE' as const, amountType: 'PRODUCT_REVENUE' as const, classified: true }
    const result = applyClassificationRules(dataset([known]), [{ id: 'r1', source: 'market-a', rawType: 'Mystery', event: 'FEE', amountClass: 'OPERATING', createdAt: '2026-09-05' }])
    expect(result.events[0]).toEqual(known)
  })

  it('preserves a known money type when classifying its unfamiliar raw label', () => {
    const unknownLabelWithKnownMoney = { ...event('1', 'New payout label', 10), amountType: 'TAX' as const }
    const result = applyClassificationRules(dataset([unknownLabelWithKnownMoney]), [{ id: 'r1', source: 'market-a', rawType: 'New payout label', event: 'TAX', amountClass: 'OPERATING', amountType: 'OTHER', createdAt: '2026-09-05' }])
    expect(result.events[0].amountType).toBe('TAX')
  })
})
