import { describe, expect, it } from 'vitest'
import type { CanonicalFinancialEvent } from '../data/types'
import type { SponsoredProductsReport } from './types'
import { buildSponsoredProductsAttribution } from './sponsoredProducts'

const event = (id: string, sku: string | null, amount: number, amountType: CanonicalFinancialEvent['amountType']): CanonicalFinancialEvent => ({
  id, source: 'marketplace', sourceDatasetId: 'd', sourceRow: 1, date: '2026-08-10', orderId: 'o', sku,
  event: amountType === 'PRODUCT_REVENUE' ? 'SALE' : 'FEE', quantity: 1, amount, amountClass: 'OPERATING', amountType,
  state: null, city: null, status: null, rawType: '', rawDescription: null, classified: true, raw: {},
})
const report: SponsoredProductsReport = { id: 'a', fileName: 'ads.xlsx', importedAt: '', minDate: '2026-08-01', maxDate: '2026-08-31', rows: [{
  date: '2026-08-10', portfolio: '', campaign: 'c', adGroup: 'g', advertisedSku: 'SKU-1', advertisedAsin: 'B001',
  impressions: 100, clicks: 10, spendExcludingTax: 100, attributedSales: 300, advertisedSkuSales: 250, otherSkuSales: 50, orders: 2, units: 3,
}] }

describe('sponsored products attribution', () => {
  it('keeps Unified advertising as financial truth and adds GST to directly allocated spend', () => {
    const result = buildSponsoredProductsAttribution([event('s', 'SKU1', 1000, 'PRODUCT_REVENUE'), event('a', null, -120, 'ADVERTISING_FEE')], report, { from: '2026-08-01', to: '2026-08-31' })
    expect(result).toMatchObject({ status: 'AVAILABLE', unifiedAdsCost: 120, reportSpendIncludingTax: 118, allocatedAdsCost: 118, unassignedAdsCost: 2, matchedSkuCount: 1 })
    expect(result.skus[0]).toMatchObject({ asin: 'B001', grossSales: 1000, attributedSales: 250, estimatedOrganicSales: 750 })
  })

  it('does not use the enrichment outside its complete period', () => {
    expect(buildSponsoredProductsAttribution([], report, { from: '2026-08-01', to: '2026-09-01' }).status).toBe('OUTSIDE_COVERAGE')
  })

  it('scales allocations down when loaded report spend exceeds the Unified financial cost', () => {
    const result = buildSponsoredProductsAttribution([event('s', 'SKU1', 1000, 'PRODUCT_REVENUE'), event('a', null, -59, 'ADVERTISING_FEE')], report, { from: '2026-08-01', to: '2026-08-31' })
    expect(result.allocatedAdsCost).toBe(59)
    expect(result.unassignedAdsCost).toBe(0)
  })
})
