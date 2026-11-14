import { describe, expect, it } from 'vitest'
import { summarizeSkuProfit } from './orderProfit'
import { compareProductPerformance, productHistoryCoverage, productProceeds, comparisonObservationCutoff } from './productPerformance'
import type { CanonicalFinancialEvent } from '../data/types'
const event = (id: string, amount: number, amountType: CanonicalFinancialEvent['amountType'], kind: CanonicalFinancialEvent['event']): CanonicalFinancialEvent => ({
  id, amount, amountType, event: kind, source: 'fixture', sourceDatasetId: 'fixture', sourceRow: 1,
  date: '2026-10-01', orderPurchaseDate: '2026-10-01', orderId: 'O1', sku: 'SKU', quantity: amountType === 'PRODUCT_REVENUE' ? 1 : null,
  amountClass: 'OPERATING', state: null, city: null, status: null, rawType: kind, rawDescription: null, classified: true, raw: {},
})
const product = (events: CanonicalFinancialEvent[]) => summarizeSkuProfit(events, 'SKU', [{ sku: 'SKU', unitCost: 100, updatedAt: '' }], 'BLOCK')
describe('product performance figures', () => {
  it('keeps proceeds before cost and ads, with fee credits netted once', () => {
    const result = product([event('sale',499,'PRODUCT_REVENUE','SALE'), event('refund',-499,'PRODUCT_REVENUE','REFUND'), event('fee',-40,'COMMISSION','FEE'), event('credit',20,'COMMISSION','REFUND'), event('shipping',-50,'SHIPPING_FEE','FEE'), event('reimbursement',30,'OTHER','REIMBURSEMENT'), event('ads',-10,'ADVERTISING_FEE','FEE')])
    expect(productProceeds(result)).toBe(-40)
  })
  it('does not invent zero baselines or deltas for unverified history', () => {
    const current = product([event('sale',499,'PRODUCT_REVENUE','SALE')])
    expect(compareProductPerformance(current, undefined, 'DOWNLOADED').sales.status).toBe('NO_BASELINE')
    expect(compareProductPerformance(current, product([]), 'DOWNLOADED').sales.status).toBe('ZERO_BASELINE')
    expect(compareProductPerformance(current, current, 'UNVERIFIED').sales.change).toBeNull()
    expect(compareProductPerformance(current, current, 'DOWNLOADED').sales.change).toBe(0)
  })
  it('suppresses margin and return rate point comparisons when denominators are zero or unrecorded', () => {
    const current = product([event('sale', 500, 'PRODUCT_REVENUE', 'SALE')])
    const zeroSalesPrevious = product([])
    const comparison = compareProductPerformance(current, zeroSalesPrevious, 'DOWNLOADED')
    expect(comparison.margin.status).toBe('NO_BASELINE')
    expect(comparison.margin.previous).toBeNull()
    expect(comparison.margin.change).toBeNull()
    expect(comparison.returnRate.status).toBe('NO_BASELINE')
    expect(comparison.returnRate.previous).toBeNull()
    expect(comparison.returnRate.change).toBeNull()
  })
  it('requires both complete purchase and transaction windows, with exclusive coverage ends', () => {
    const range = { from: '2026-10-01', to: '2026-10-02' }
    const coverage = [{ from: '2026-09-30T18:30:00Z', to: '2026-10-02T18:30:00Z' }]
    expect(productHistoryCoverage(range,coverage,coverage,330)).toBe('DOWNLOADED')
    expect(productHistoryCoverage(range,coverage,[],330)).toBe('INCOMPLETE')
    expect(productHistoryCoverage(range,undefined,undefined)).toBe('UNVERIFIED')
  })
  it('computes comparison observation cutoff with bounded reduce across large ranges without overflow', () => {
    const manyRanges = Array.from({ length: 1000 }, (_, i) => ({
      from: new Date(Date.UTC(2026, 9, 1) + i * 3600000).toISOString(),
      to: new Date(Date.UTC(2026, 9, 1) + (i + 1) * 3600000).toISOString(),
    }))
    const now = new Date(Date.UTC(2026, 9, 1) + 1000 * 3600000).toISOString()
    const cutoff = comparisonObservationCutoff(manyRanges, manyRanges, now, 0)
    expect(cutoff).toBe(now)
  })
})
