import { describe, expect, it } from 'vitest'
import type { CanonicalFinancialEvent } from '../data/types'
import { buildAdvertisingSkuInsight, filterAdvertisingScope, filterAdvertisingSkus, summarizeAdvertising } from './advertisingSummary'

const event = (id: string, amount: number, amountType: CanonicalFinancialEvent['amountType'], sku: string | null, date = '2026-08-01'): CanonicalFinancialEvent => ({ id, source: 'test', sourceDatasetId: 'd', sourceRow: 1, date, orderId: null, sku, event: amountType === 'PRODUCT_REVENUE' ? 'SALE' : 'FEE', quantity: 1, amount, amountClass: 'OPERATING', amountType, state: null, city: null, status: null, rawType: '', rawDescription: null, classified: true, raw: {} })

describe('advertising summary', () => {
  it('calculates TACOS, ROAS, and daily trend from canonical events', () => {
    const result = summarizeAdvertising([event('s1', 600, 'PRODUCT_REVENUE', 'A'), event('s2', 400, 'PRODUCT_REVENUE', 'B'), event('a1', -100, 'ADVERTISING_FEE', null)])
    expect(result).toMatchObject({ grossSales: 1000, adsSpend: 100, tacos: 10, roas: 10, directAdsSpend: 0, unassignedAdsSpend: 100, attributionCoverage: 0 })
    expect(result.trend[0]).toMatchObject({ grossSales: 1000, adsSpend: 100, tacos: 10, roas: 10 })
  })

  it('keeps direct attribution and never spreads unassigned spend across SKUs', () => {
    const result = summarizeAdvertising([event('s1', 600, 'PRODUCT_REVENUE', 'A'), event('s2', 400, 'PRODUCT_REVENUE', 'B'), event('a1', -20, 'ADVERTISING_FEE', 'A'), event('a2', -80, 'ADVERTISING_FEE', null)])
    expect(result.skus.find((item) => item.sku === 'A')).toMatchObject({ directAdsSpend: 20, attribution: 'DIRECT' })
    expect(result.skus.find((item) => item.sku === 'B')).toMatchObject({ directAdsSpend: 0, attribution: 'UNATTRIBUTED' })
    expect(result.skus.reduce((total, item) => total + item.directAdsSpend, 0)).toBe(20)
    expect(result.unassignedAdsSpend).toBe(80)
  })

  it('nets advertising credits against charges', () => {
    const result = summarizeAdvertising([event('s1', 500, 'PRODUCT_REVENUE', 'A'), event('a1', -100, 'ADVERTISING_FEE', null), event('a2', 25, 'ADVERTISING_FEE', null)])
    expect(result.adsSpend).toBe(75)
  })

  it('filters and sorts SKU attribution without changing the summary', () => {
    const result = summarizeAdvertising([event('s1', 100, 'PRODUCT_REVENUE', 'SKU-B'), event('s2', 300, 'PRODUCT_REVENUE', 'SKU-A'), event('a1', -40, 'ADVERTISING_FEE', null)])
    expect(filterAdvertisingSkus(result.skus, { search: 'sku', sort: 'GROSS_SALES', direction: 'ASC' }).map((item) => item.sku)).toEqual(['SKU-B', 'SKU-A'])
    expect(result.adsSpend).toBe(40)
  })

  it('filters account and fulfillment dimensions while retaining dimension-less spend', () => {
    const cardSale = { ...event('s1', 300, 'PRODUCT_REVENUE', 'A'), accountType: 'Card', fulfillmentType: 'Merchant' }
    const codSale = { ...event('s2', 200, 'PRODUCT_REVENUE', 'B'), accountType: 'COD', fulfillmentType: 'Warehouse' }
    const unassignedAd = { ...event('a1', -30, 'ADVERTISING_FEE', null), accountType: 'Card', fulfillmentType: null }
    const scoped = filterAdvertisingScope([cardSale, codSale, unassignedAd], { accountType: 'Card', fulfillmentType: 'Merchant' })
    expect(scoped.map((item) => item.id)).toEqual(['s1', 'a1'])
    expect(summarizeAdvertising(scoped)).toMatchObject({ grossSales: 300, adsSpend: 30 })
  })

  it('calculates SKU profit only from directly attributed ads', () => {
    const advertising = { sku: 'A', grossSales: 1000, directAdsSpend: 20, tacos: 2, roas: 50, attribution: 'DIRECT' as const }
    const profitability = { sku: 'A', grossSales: 1000, advertising: 20, profit: 180 } as never
    expect(buildAdvertisingSkuInsight(advertising, profitability)).toMatchObject({ hasDirectAttribution: true, profitBeforeAds: 200, profitAfterDirectAds: 180, marginAfterDirectAds: 18, breakEvenTacos: 20, maximumAffordableAds: 200 })
  })

  it('marks SKU after-ad metrics unavailable when spend has no direct SKU', () => {
    const advertising = { sku: 'A', grossSales: 1000, directAdsSpend: 0, tacos: 0, roas: 0, attribution: 'UNATTRIBUTED' as const }
    const profitability = { sku: 'A', grossSales: 1000, advertising: 0, profit: 200 } as never
    expect(buildAdvertisingSkuInsight(advertising, profitability)).toMatchObject({ hasDirectAttribution: false, tacos: null, roas: null, profitAfterDirectAds: null, marginAfterDirectAds: null, profitBeforeAds: 200 })
  })
})
