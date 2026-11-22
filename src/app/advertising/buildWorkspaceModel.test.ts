import { describe, expect, it } from 'vitest'
import { sponsoredWorkspaceSource } from '../../adapters/amazon-ads/workspaceSource'
import type { SponsoredProductRow, SponsoredProductsReport } from '../../core/advertising/types'
import type { AdvertisingViewQuery } from '../../features/advertising-workspace/contract'
import { buildAdvertisingWorkspaceModel, type BuildAdvertisingWorkspaceInput } from './buildWorkspaceModel'
import { replaceSupplementalWindow, supplementalWorkspaceSource } from '../../adapters/amazon-ads/supplemental'

const row = (sku: string, spend: number, sales: number, date = '2026-11-10', campaignId = 'c1'): SponsoredProductRow => ({ date, advertisedSku: sku, advertisedAsin: 'B012345678', campaign: 'Same campaign name', adGroup: 'Shared group', portfolio: '', spendExcludingTax: spend, attributedSales: sales, advertisedSkuSales: sales / 2, otherSkuSales: sales / 2, impressions: 100, clicks: 10, orders: 1, units: 1, raw: { campaignId, adGroupId: 'g1', adId: sku, futureField: 'keep' } })
const report: SponsoredProductsReport = { id: 'ads-api:123', fileName: 'API', importedAt: '2026-11-19T00:00:00Z', minDate: '2026-10-14', maxDate: '2026-11-18', rows: [row('white', 900, 5000), row('walnut', 100, 1000), row('white', 200, 500, '2026-10-20')] }
const query: AdvertisingViewQuery = { view: 'overview', from: '2026-11-01', to: '2026-11-18', scope: { kind: 'ACCOUNT' }, search: '', sort: 'SPEND', direction: 'DESC', page: 0 }
const fixture = (): BuildAdvertisingWorkspaceInput => ({ source: sponsoredWorkspaceSource(report), query, advertiser: 'Seller', asOf: '2026-11-19T12:00:00Z', groups: [], selectedEntity: null, refreshing: false, error: null,
  financial: { completeCoverage: true, compatibleTaxBasis: true, products: [{ productId: 'white', totalProductSales: 8000, contributionBeforeReportedAds: 1500, completeCosts: true }, { productId: 'walnut', totalProductSales: 4000, contributionBeforeReportedAds: 500, completeCosts: true }] } })
describe('advertising workspace model orchestration', () => {
  it('keeps supplemental spend separate and labels product search-term evidence as shared', () => {
    const source = supplementalWorkspaceSource(replaceSupplementalWindow(null, { from: query.from, to: query.to }, [{ date: '2026-11-10', campaignId: 'c1', adGroupId: 'g1', keywordId: 'k', keyword: 'desk', matchType: 'BROAD', searchTerm: 'small desk', impressions: 50, clicks: 5, cost: 700, sales7d: 1000, attributedSalesSameSku7d: 800, salesOtherSku7d: 200, purchases7d: 2, unitsSoldClicks7d: 2 }], '123', 'searchTerm', report.importedAt))
    const model = buildAdvertisingWorkspaceModel({ ...fixture(), supplemental: { searchTerm: source }, selectedEntity: { kind: 'PRODUCT', id: 'white' } })
    expect(model.summary.find(item => item.id === 'spend')?.value).toBe(1000)
    expect(model.detail?.metrics.spend).toBe(900)
    expect(model.detail?.searchTerms[0]).toMatchObject({ attributionScope: 'SHARED_AD_GROUP', metrics: { spend: 700, tacos: null, profitAfterAds: null } })
    expect(model.availableViews.map(item => item.id)).toContain('searchTerms')
    expect(model.detail?.availableSections).toContain('searchTerms')
  })
  it('recomputes group ratios from totals and shows cross-sale evidence without extra spend', () => {
    const group = { id: 'family', name: 'Family', version: 1, origin: 'MANUAL' as const, productIds: ['white', 'walnut'] }
    const primary = sponsoredWorkspaceSource({ ...report, rows: report.rows.map(item => ({ ...item, advertisedAsin: item.advertisedSku === 'white' ? 'B000000001' : 'B000000002' })) })
    const purchased = supplementalWorkspaceSource(replaceSupplementalWindow(null, query, [{ date: '2026-11-10', campaignId: 'c1', adGroupId: 'g1', advertisedSku: 'white', advertisedAsin: 'B000000001', purchasedAsin: 'B000000002', sales7d: 0, purchases7d: 0, unitsSoldClicks7d: 0, salesOtherSku7d: 450, purchasesOtherSku7d: 1, unitsSoldOtherSku7d: 1 }], '123', 'purchasedProduct', report.importedAt))
    const model = buildAdvertisingWorkspaceModel({ ...fixture(), source: primary, groups: [group], query: { ...query, scope: { kind: 'GROUP', groupId: group.id, version: 1, productIds: group.productIds } }, selectedEntity: { kind: 'GROUP', id: group.id }, supplemental: { purchasedProduct: purchased } })
    expect(model.detail?.metrics.acos).toBeCloseTo(1000 / 6000 * 100)
    expect(model.detail?.crossSales[0]).toMatchObject({ advertisedProduct: 'white', purchasedProduct: 'walnut', relationship: 'SIBLING', attributedSales: 450 })
    expect(model.summary.find(item => item.id === 'attributedSales')?.value).toBe(6000)
  })
  it('uses page one for the first 30 results and clamps stale page choices', () => {
    const source = sponsoredWorkspaceSource({ ...report, rows: Array.from({ length: 35 }, (_, index) => row(`sku${index}`, 35 - index, 100, '2026-11-10', `c${index}`)) })
    const first = buildAdvertisingWorkspaceModel({ ...fixture(), source, query: { ...query, view: 'campaigns', page: 1 } })
    const second = buildAdvertisingWorkspaceModel({ ...fixture(), source, query: { ...query, view: 'campaigns', page: 999 } })
    expect(first.campaigns).toHaveLength(30)
    expect(first.campaigns[0].entity.id).toBe('c0')
    expect(second.query.page).toBe(2)
    expect(second.campaigns).toHaveLength(5)
  })
  it('uses compatible principal for TACOS and retains seven-day total sales including cross-sales', () => {
    const model = buildAdvertisingWorkspaceModel({ ...fixture(), query: { ...query, view: 'products' } })
    expect(model.summary.find(item => item.id === 'tacos')?.value).toBeCloseTo(1000 / 12000 * 100)
    expect(model.summary.find(item => item.id === 'acos')?.value).toBeCloseTo(1000 / 6000 * 100)
    expect(model.products.find(item => item.entity.id === 'white')?.metrics.profitAfterAds).toBe(600)
  })
  it('restricts campaign drilldown amounts to the selected product instead of showing the whole campaign', () => {
    const model = buildAdvertisingWorkspaceModel({ ...fixture(), selectedEntity: { kind: 'PRODUCT', id: 'white' } })
    expect(model.campaigns[0].metrics.spend).toBe(1000)
    expect(model.detail?.campaigns[0].metrics.spend).toBe(900)
    const nested = buildAdvertisingWorkspaceModel({ ...fixture(), selectedEntity: { kind: 'CAMPAIGN', id: 'c1' }, detailContext: { ...query, scope: { kind: 'PRODUCT', productId: 'white' } } })
    expect(nested.detail?.metrics.spend).toBe(900)
    expect(nested.detail?.products).toHaveLength(1)
    const campaign = buildAdvertisingWorkspaceModel({ ...fixture(), selectedEntity: { kind: 'CAMPAIGN', id: 'c1' } })
    expect(campaign.detail?.products.every(item => item.metrics.tacos === null && item.metrics.profitAfterAds === null)).toBe(true)
  })
  it('uses equal complete closed windows and percentage-point changes for ACOS', () => {
    const model = buildAdvertisingWorkspaceModel(fixture())
    expect(model.comparisonLabel).toBe('2026-10-14 – 2026-10-31')
    expect(model.summary.find(item => item.id === 'spend')?.change).toMatchObject({ value: 400, unit: 'PERCENT', favorable: null })
    expect(model.summary.find(item => item.id === 'acos')?.change?.unit).toBe('PERCENTAGE_POINTS')
    const partial = buildAdvertisingWorkspaceModel({ ...fixture(), asOf: '2026-11-18T12:00:00Z' })
    expect(partial.summary.every(item => item.change === null)).toBe(true)
    expect(partial.sourceState).toBe('PARTIAL')
  })
  it('never manufactures financial campaign profitability or missing-cost profit', () => {
    const input = fixture()
    const campaign = buildAdvertisingWorkspaceModel({ ...input, query: { ...query, view: 'products', campaignId: 'c1' } })
    expect(campaign.summary.find(item => item.id === 'tacos')?.value).toBeNull()
    expect(campaign.products.every(item => item.metrics.profitAfterAds === null)).toBe(true)
    const missingCost = buildAdvertisingWorkspaceModel({ ...input, query: { ...query, view: 'products' }, financial: { ...input.financial!, products: input.financial!.products.map(item => ({ ...item, completeCosts: false, contributionBeforeReportedAds: null })) } })
    expect(missingCost.products.every(item => item.metrics.profitAfterAds === null)).toBe(true)
  })
  it('keeps duplicate campaign names distinct using source IDs and excludes unimplemented views', () => {
    const source = sponsoredWorkspaceSource({ ...report, rows: [row('white', 900, 5000, '2026-11-10', 'c1'), row('walnut', 100, 1000, '2026-11-10', 'c2')] })
    const model = buildAdvertisingWorkspaceModel({ ...fixture(), source })
    expect(model.campaigns).toHaveLength(2)
    expect(model.campaigns.map(item => item.entity.id)).toEqual(['c1', 'c2'])
    expect(model.availableViews.map(item => item.id)).not.toContain('searchTerms')
    expect(source.dataset.facts[0].raw?.futureField).toBe('keep')
  })
  it('does not turn missing advertising coverage into zero-ad financial product rows', () => {
    const model = buildAdvertisingWorkspaceModel({ ...fixture(), source: null })
    expect(model.products).toEqual([])
    expect(model.summary.every(item => item.value === null)).toBe(true)
    const outside = buildAdvertisingWorkspaceModel({ ...fixture(), query: { ...query, from: '2026-08-01', to: '2026-08-31' } })
    expect(outside.summary.every(item => item.value === null)).toBe(true)
  })
})
