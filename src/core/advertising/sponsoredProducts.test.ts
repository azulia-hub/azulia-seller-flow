import { listAccountCharges } from '../analytics/accountCharges'
import { buildSellerAdvertisingOverview, buildSellerProductOverview, buildSellerProductOverviews } from './sellerOverview'
import { describe, expect, it } from 'vitest'
import type { CanonicalFinancialEvent } from '../data/types'
import type { SponsoredProductsReport } from './types'
import { buildSkuAdvertisingEconomics, buildSponsoredProductsAttribution, intersectAdvertisingRange } from './sponsoredProducts'
import { summarizeDashboard } from '../analytics/dashboardSummary'
import { calculateCosts } from '../costs/calculateCosts'
import { summarizeSkuProfit } from '../analytics/orderProfit'

const event = (id: string, sku: string | null, amount: number, amountType: CanonicalFinancialEvent['amountType'], extra: Partial<CanonicalFinancialEvent> = {}): CanonicalFinancialEvent => ({
  id, source: 'marketplace', sourceDatasetId: 'd', sourceRow: 1, date: '2026-08-10', orderId: 'o', sku,
  event: amountType === 'PRODUCT_REVENUE' ? 'SALE' : 'FEE', quantity: 1, amount, amountClass: 'OPERATING', amountType,
  state: null, city: null, status: null, rawType: '', rawDescription: null, classified: true, raw: {}, ...extra,
})
const report: SponsoredProductsReport = { id: 'a', fileName: 'ads.xlsx', importedAt: '', minDate: '2026-08-01', maxDate: '2026-08-31', rows: [{
  date: '2026-08-10', portfolio: '', campaign: 'c', adGroup: 'g', advertisedSku: 'SKU1', advertisedAsin: 'B001',
  impressions: 100, clicks: 10, spendExcludingTax: 100, attributedSales: 300, advertisedSkuSales: 250, otherSkuSales: 50, orders: 2, units: 3,
}] }
const range = { from: '2026-08-01', to: '2026-08-31' }
const events = [event('s', 'SKU1', 1000, 'PRODUCT_REVENUE'), event('a', null, -59, 'ADVERTISING_FEE')]

describe('sponsored products attribution', () => {
  it('finds shared dates for a shorter ads report without expanding financial coverage', () => {
    expect(intersectAdvertisingRange(report, { from: '2026-08-01', to: '2026-10-19' })).toEqual(range)
    expect(intersectAdvertisingRange(report, { from: '2026-08-15', to: '2026-10-19' })).toEqual({ from: '2026-08-15', to: '2026-08-31' })
    expect(intersectAdvertisingRange(report, { from: '2026-09-01', to: '2026-10-19' })).toBeNull()
    expect(intersectAdvertisingRange(null, range)).toBeNull()
  })
  it('retains reported spend even above booked cost; never guesses GST or organic sales', () => {
    const result = buildSponsoredProductsAttribution(events, report, range)
    expect(result).toMatchObject({ status: 'AVAILABLE', unifiedAdsCost: 59, reportSpendExcludingTax: 100, matchedSpend: 100, unmatchedSpend: 0, reconciliationDifference: -41 })
    expect(result.skus[0]).toMatchObject({ asin: 'B001', grossSales: 1000, spend: 100, attributedSales: 300, sameSkuSales: 250, otherSkuSales: 50, roas: 3, tacos: 10, cpc: 10, ctr: 10, conversionRate: 20, costPerAttributedOrder: 50 })
    expect(result.skus[0].acos).toBeCloseTo(100 / 3)
    expect(result.skus[0].campaigns[0].spend).toBe(100)
    expect(result.skus[0].daily[0].date).toBe('2026-08-10')
  })
  it('sums all campaigns, filters dates inclusively and preserves unmatched spend', () => {
    const rows = [report.rows[0], { ...report.rows[0], campaign: 'second', spendExcludingTax: 40 }, { ...report.rows[0], advertisedSku: 'UNKNOWN', spendExcludingTax: 60 }, { ...report.rows[0], date: '2026-09-01', spendExcludingTax: 999 }]
    const result = buildSponsoredProductsAttribution(events, { ...report, rows }, range)
    expect(result.reportSpendExcludingTax).toBe(200)
    expect(result.matchedSpend).toBe(140)
    expect(result.unmatchedSpend).toBe(60)
    expect(result.skus[0].campaigns).toHaveLength(2)
    expect(result.unmatched[0]).toMatchObject({ sku: 'UNKNOWN', spend: 60 })
    expect(result.matchedSpend + result.unmatchedSpend).toBe(result.reportSpendExcludingTax)
  })
  it('requires source-specific identity normalization and preserves punctuation distinctions', () => {
    const altered = { ...report, rows: [{ ...report.rows[0], advertisedSku: 'SKU1-MFN' }] }
    expect(buildSponsoredProductsAttribution(events, altered, range).unmatchedSpend).toBe(100)
    expect(buildSponsoredProductsAttribution(events, altered, range, { normalizeSku: sku => sku.replace(/-MFN$/, '') }).matchedSpend).toBe(100)
    expect(buildSponsoredProductsAttribution(events, { ...report, rows: [{ ...report.rows[0], advertisedSku: 'SKU-1' }] }, range).unmatchedSpend).toBe(100)
  })
  it('keeps ambiguous aliases unmatched rather than arbitrarily choosing a SKU', () => {
    const result = buildSponsoredProductsAttribution([...events, event('s2', 'sku1', 10, 'PRODUCT_REVENUE')], { ...report, rows: [{ ...report.rows[0], advertisedSku: 'Sku1' }] }, range, { normalizeSku: sku => sku.toLowerCase() })
    expect(result.unmatched[0].reason).toBe('Ambiguous SKU identity')
  })
  it('returns explicit coverage and unsupported-filter states', () => {
    expect(buildSponsoredProductsAttribution(events, report, { ...range, to: '2026-09-01' }).status).toBe('OUTSIDE_COVERAGE')
    expect(buildSponsoredProductsAttribution(events, report, range, { unsupportedFilter: true }).status).toBe('UNSUPPORTED_FILTER')
    expect(buildSponsoredProductsAttribution(events, null, range).status).toBe('NO_REPORT')
  })
  it('uses unavailable ratios for zero denominators rather than invented zeros', () => {
    const result = buildSponsoredProductsAttribution(events, { ...report, rows: [{ ...report.rows[0], spendExcludingTax: 0, attributedSales: 0, clicks: 0, impressions: 0, orders: 0 }] }, range)
    expect(result.skus[0]).toMatchObject({ acos: null, roas: null, cpc: null, ctr: null, conversionRate: null, costPerAttributedOrder: null })
  })
})

describe('joined SKU advertising economics', () => {
  const financial = [
    event('sale', 'SKU1', 1000, 'PRODUCT_REVENUE', { quantity: 10 }),
    event('refund', 'SKU1', -200, 'PRODUCT_REVENUE', { event: 'REFUND', quantity: 2 }),
    event('commission', 'SKU1', -80, 'COMMISSION'), event('shipping', 'SKU1', -50, 'SHIPPING_FEE'),
    event('reversal', 'SKU1', 10, 'SHIPPING_FEE'), event('tax', 'SKU1', 20, 'TAX', { event: 'TAX' }),
    event('promotion', 'SKU1', -10, 'PROMOTION'), event('other', 'SKU1', -5, 'UNKNOWN', { classified: false }),
    event('ad', 'SKU1', -30, 'ADVERTISING_FEE'), event('account', null, -100, 'OTHER_FEE', { orderId: null }),
    event('settlement', null, -500, 'OTHER', { event: 'SETTLEMENT', amountClass: 'SETTLEMENT' }),
  ]
  const costs = [{ sku: 'SKU1', unitCost: 40, updatedAt: '2026-08-01' }]
  it('retains all SKU charges, reverses good-return COGS and deducts product ads exactly once', () => {
    const product = summarizeSkuProfit(financial, 'SKU1', costs, 'BLOCK')
    const ads = buildSponsoredProductsAttribution(financial, report, range).skus[0]
    const result = buildSkuAdvertisingEconomics(product, ads)
    // 1000 - 200 - 80 - 50 + 10 + 20 - 10 - 5 - (10 - 2)*40 = 365 before ads.
    expect(result).toMatchObject({ contributionBeforeReportedAds: 365, contributionAfterReportedAds: 265, bookedSkuAdvertisingRestored: 30, costPerSoldUnit: 10, costPerRetainedUnit: 12.5 })
    expect(product.profit).toBe(335)
    const beforeSubtotal = result.bridge.slice(0, result.bridge.findIndex(row => row.label === 'Product contribution before reported ads'))
    expect(beforeSubtotal.reduce((total, row) => total + (row.amount ?? 0), 0)).toBe(365)
  })
  it('keeps business profit on Unified booked expense while product contribution follows reported spend', () => {
    const businessProfit = () => summarizeDashboard(financial).operatingNet - calculateCosts(financial, costs).netCogs
    expect(businessProfit()).toBe(235)
    const product = summarizeSkuProfit(financial, 'SKU1', costs, 'BLOCK')
    const original = JSON.stringify(financial)
    const first = buildSponsoredProductsAttribution(financial, report, range)
    const second = buildSponsoredProductsAttribution(financial, { ...report, rows: [{ ...report.rows[0], spendExcludingTax: 250 }] }, range)
    expect(buildSkuAdvertisingEconomics(product, first.skus[0]).contributionAfterReportedAds).toBe(265)
    expect(buildSkuAdvertisingEconomics(product, second.skus[0]).contributionAfterReportedAds).toBe(115)
    expect(businessProfit()).toBe(235)
    expect(JSON.stringify(financial)).toBe(original)
    expect(first.reconciliationDifference).toBe(-70)
    expect(first).not.toHaveProperty('actualAdvertisingTax')
    expect(first.skus[0]).not.toHaveProperty('advertisingTax')
  })
  it('blocks definitive profit with missing costs even under assume-zero policy', () => {
    const product = summarizeSkuProfit(financial, 'SKU1', [], 'ASSUME_ZERO')
    const ads = buildSponsoredProductsAttribution(financial, report, range).skus[0]
    expect(buildSkuAdvertisingEconomics(product, ads)).toMatchObject({ contributionBeforeReportedAds: null, contributionAfterReportedAds: null })
  })
  it('makes per-retained-unit costs unavailable when nothing is retained', () => {
    const product = summarizeSkuProfit(financial, 'SKU1', costs, 'BLOCK')
    const ads = buildSponsoredProductsAttribution(financial, report, range).skus[0]
    expect(buildSkuAdvertisingEconomics({ ...product, netDeliveredQuantity: 0 }, ads).costPerRetainedUnit).toBeNull()
  })
})


describe('seller overview composition', () => {
  it('uses posted financial sales for reported TACOS without changing booked totals', () => {
    const attribution = buildSponsoredProductsAttribution(events, report, range)
    expect(buildSellerAdvertisingOverview(attribution, 1000).tacos).toBe(10)
    expect(buildSellerAdvertisingOverview(attribution, 0).tacos).toBeNull()
    expect(buildSellerAdvertisingOverview(buildSponsoredProductsAttribution(events, null, range), 1000).tacos).toBeNull()
    expect(attribution.unifiedAdsCost).toBe(59)
  })
  it('keeps displayed sales, returns and contribution on the posting basis', () => {
    const attribution = buildSponsoredProductsAttribution(events, report, range)
    const posted = summarizeSkuProfit(events, 'SKU1', [{ sku: 'SKU1', unitCost: 100, updatedAt: '' }], 'BLOCK')
    const cohort = { ...posted, grossSales: 5000, returnQuantity: 8, missingCost: true }
    const row = buildSellerProductOverview(cohort, posted, attribution)
    expect(row.product).toBe(posted)
    expect(row.product.grossSales).toBe(1000)
    expect(row.product.returnQuantity).toBe(posted.returnQuantity)
    expect(row.contribution).toBe(800)
    const withoutAds = buildSellerProductOverview(cohort, posted, buildSponsoredProductsAttribution(events, null, range))
    expect(withoutAds.product).toBe(cohort)
    expect(withoutAds.contributionStatus).toBe('NO_ADS_EVIDENCE')
  })
  it('indexed list composition matches individual selector results without mutating source evidence', () => {
    const attribution = buildSponsoredProductsAttribution(events, report, range)
    const posted = summarizeSkuProfit(events, 'SKU1', [{ sku:'SKU1', unitCost:100, updatedAt:'' }], 'BLOCK')
    const products = [posted, { ...posted, sku:'UNKNOWN', missingCost:true }]
    const before = JSON.stringify({ products, attribution })
    expect(buildSellerProductOverviews(products,[posted],attribution)).toEqual(products.map(product => buildSellerProductOverview(product,product.sku === posted.sku ? posted : undefined,attribution)))
    expect(JSON.stringify({ products, attribution })).toBe(before)
  })
  it('joins product evidence while retaining missing costs and unmatched status', () => {
    const attribution = buildSponsoredProductsAttribution(events, report, range)
    const product = summarizeSkuProfit(events, 'SKU1', [], 'ASSUME_ZERO')
    expect(buildSellerProductOverview(product, product, attribution)).toMatchObject({ contribution: null, contributionStatus: 'MISSING_COST' })
    expect(buildSellerProductOverview(product, undefined, attribution)).toMatchObject({ contribution: null, contributionStatus: 'NO_FINANCIAL_ACTIVITY' })
    expect(buildSellerProductOverview({ ...product, sku: 'UNKNOWN' }, product, attribution).contributionStatus).toBe('NO_ADS_EVIDENCE')
    const complete = { ...product, missingCost: false }
    expect(buildSellerProductOverview(complete, complete, attribution)).toMatchObject({ contributionStatus: 'AVAILABLE', contribution: 900 })
    // Missing cohort costs must not block complete posting-period economics.
    expect(buildSellerProductOverview(product, complete, attribution).contribution).toBe(900)
  })
})


it('lists included account entries independently of ads while preserving unknown adjustments', () => {
  const account = event('account', null, -25, 'OTHER', { orderId: null, rawDescription: 'Account service', classified: false })
  const rows = listAccountCharges([...events, account,
    event('linked', null, -10, 'OTHER'),
    event('transfer', null, -500, 'OTHER', { orderId: null, amountClass: 'SETTLEMENT' }),
  ])
  expect(rows).toEqual([{ label: 'Account service', amount: -25, classified: false }])
  expect(listAccountCharges([])).toEqual([])
})
