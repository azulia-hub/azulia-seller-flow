import { describe, expect, it } from 'vitest'
import type { CanonicalFinancialEvent } from '../data/types'
import type { ProductCost } from '../costs/types'
import { createProductCostResolver } from '../costs/calculateCosts'
import { summarizeProductProfitability, summarizeSkuProfit } from './orderProfit'
import { previewProductProfitability } from './productCostPreview'
import { setProductCost } from '../costs/setProductCost'
import { buildBusinessOverview } from './businessOverview'

const event = (id: string, extra: Partial<CanonicalFinancialEvent> = {}): CanonicalFinancialEvent => ({
  id, source: 'generic', sourceDatasetId: 'x', sourceRow: 1, date: '2026-08-01', orderId: 'ORDER', sku: 'A', event: 'SALE', quantity: 1, amount: 100,
  amountClass: 'OPERATING', amountType: 'PRODUCT_REVENUE', state: null, city: null, status: null, rawType: 'Sale', rawDescription: 'Example product', classified: true, raw: {}, ...extra,
})
const costs: ProductCost[] = [{ sku: 'A', unitCost: 10, updatedAt: '' }, { sku: 'B', unitCost: 20, updatedAt: '' }]

describe('indexed analytics parity', () => {
  it('matches individual SKU analysis, including unassigned and multi-SKU order charges', () => {
    const events = [event('a'), event('b', { sku: 'B', orderId: 'SECOND' }), event('c', { sku: null, amount: -5, event: 'FEE', amountType: 'COMMISSION' }),
      event('empty-sku', { sku: '', event: 'FEE', amountType: 'OTHER_FEE', amount: -2 }), event('d', { orderId: 'MULTI' }), event('e', { sku: 'B', orderId: 'MULTI' }), event('f', { sku: null, orderId: 'MULTI', event: 'FEE', amountType: 'COMMISSION', amount: -15 }),
      event('unknown', { sku: null, orderId: null, event: 'UNKNOWN', amountType: 'UNKNOWN', amount: 7, classified: false })]
    const original = JSON.stringify(events)
    expect(summarizeProductProfitability(events, costs, 'BLOCK')).toEqual(['A','B'].map(sku => summarizeSkuProfit(events, sku, costs, 'BLOCK')))
    expect(JSON.stringify(events)).toBe(original)
  })
  it('rebuilds only cost-affected products and agrees with complete recalculation', () => {
    const events = [event('a'), event('b', { sku: 'B', orderId: 'SECOND' })]
    const saved = summarizeProductProfitability(events, costs, 'BLOCK')
    const next = setProductCost(costs, { sku: 'A', unitCost: 25, updatedAt: 'new' })
    const preview = previewProductProfitability(saved, events, next, 'BLOCK', 'A')
    expect(preview).toEqual(summarizeProductProfitability(events, next, 'BLOCK'))
    expect(preview[1]).toBe(saved[1])
    expect(preview[0].profit).toBe(75)
  })
  it('keeps refund trend COGS on the original sale date after a cost increase', () => {
    const events = [event('sale'), event('refund', { date: '2026-09-01', event: 'REFUND', amount: -100, returnType: 'CUSTOMER_RETURN', sourceRow: 2 })]
    const product = summarizeSkuProfit(events, 'A', [...costs, { sku: 'A', unitCost: 40, effectiveFrom: '2026-09-01', updatedAt: '' }], 'BLOCK')
    expect(product.netCogs).toBe(0)
    expect(product.trend.map(point => point.profit)).toEqual([90, -90])
    expect(product.trend.reduce((sum, point) => sum + point.profit, 0)).toBe(product.profit)
  })
  it('keeps cost lookup precedence, missing periods, zero costs and source normalization', () => {
    const records = [...costs, { sku:'A', unitCost:30, effectiveFrom:'2026-08-15', updatedAt:'' }, { sku:'C', unitCost:0, effectiveFrom:'2026-08-01', updatedAt:'' }]
    const resolve = createProductCostResolver(records, value => value.replace('-ALIAS', ''))
    expect(resolve('a', '2026-08-01')?.unitCost).toBe(10)
    expect(resolve('A-ALIAS', '2026-08-15')?.unitCost).toBe(30)
    expect(resolve('A', null)?.unitCost).toBe(10)
    expect(resolve('C', '2026-07-31')).toBeUndefined()
    expect(resolve('C', '2026-08-01')?.unitCost).toBe(0)
  })
  it('composes business metrics without including settlements or hiding unknown activity', () => {
    const events = [event('sale'), event('ads', { orderId:null, sku:null, event:'FEE', amountType:'ADVERTISING_FEE', amount:-5 }),
      event('unknown', { orderId:null, sku:null, event:'UNKNOWN', amountType:'UNKNOWN', amount:7, classified:false }),
      event('settlement', { orderId:null, sku:null, event:'SETTLEMENT', amountClass:'SETTLEMENT', amount:-500 })]
    const result = buildBusinessOverview(events, costs, 'BLOCK')
    expect(result.profitAfterAds).toBe(92)
    expect(result.summary.unclassifiedAmount).toBe(7)
    expect(result.orderCount).toBe(1)
    expect(buildBusinessOverview(events, [], 'BLOCK').costStatus.profitReady).toBe(false)
    expect(buildBusinessOverview(events, [], 'ASSUME_ZERO').costStatus).toMatchObject({ profitReady:true, complete:false })
  })
})
