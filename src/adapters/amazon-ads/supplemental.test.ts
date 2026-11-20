import { describe, expect, it } from 'vitest'
import { adsReportKind, parseSupplementalRows, replaceSupplementalWindow, reportSpecification, supplementalWorkspaceSource } from './supplemental'
import { aggregateAdvertisingFacts } from '../../core/advertising/workspace'
const range = { from: '2026-11-01', to: '2026-11-18' }
const search = { date: '2026-11-10', campaignId: 'c', campaignName: 'Campaign', adGroupId: 'g', keywordId: 'k', keyword: 'table', keywordType: 'BROAD', matchType: 'BROAD', searchTerm: 'small bedside table', impressions: 100, clicks: 5, cost: 50, sales7d: 1000, attributedSalesSameSku7d: 600, salesOtherSku7d: 400, purchases7d: 2, unitsSoldClicks7d: 3, futureField: { label: 'preserved' } }
describe('additional Ads report source contracts', () => {
  it('requests distinct daily report grains with no unsupported purchase spend columns', () => {
    expect(reportSpecification(range, 'searchTerm').configuration).toMatchObject({ reportTypeId: 'spSearchTerm', groupBy: ['searchTerm'], timeUnit: 'DAILY' })
    expect(reportSpecification(range, 'purchasedProduct').configuration).toMatchObject({ reportTypeId: 'spPurchasedProduct', groupBy: ['asin'] })
    expect(reportSpecification(range, 'purchasedProduct').configuration.columns).not.toContain('cost')
    expect(() => adsReportKind('arbitrary/url')).toThrow()
    const first = reportSpecification(range, 'searchTerm'); first.configuration.columns.push('poison')
    expect(reportSpecification(range, 'searchTerm').configuration.columns).not.toContain('poison')
  })
  it('preserves complete search identities/unknown fields without assigning them to a SKU', () => {
    const rows = parseSupplementalRows([search], range, 'searchTerm')
    const report = replaceSupplementalWindow(null, range, rows, '123', 'searchTerm', 'now')
    const source = supplementalWorkspaceSource(report)
    expect(source.dataset.facts[0]).toMatchObject({ campaignId: 'c', productId: null, targetId: 'k', searchTerm: 'small bedside table', spend: 50, raw: { futureField: { label: 'preserved' } } })
    expect(() => aggregateAdvertisingFacts(source.dataset, { ...range, scope: { kind: 'PRODUCT', productId: 'sku' } })).toThrow('does not establish product-level')
    for (const cost of [undefined, null, '', -1]) expect(() => parseSupplementalRows([{ ...search, cost }], range, 'searchTerm')).toThrow()
  })
  it('retains advertised and purchased ASINs while keeping unavailable spend/clicks null', () => {
    const raw = { date: '2026-11-10', campaignId: 'c', adGroupId: 'g', advertisedSku: 'white', advertisedAsin: 'B012345678', purchasedAsin: 'B087654321', sales7d: 0, purchases7d: 0, unitsSoldClicks7d: 0, salesOtherSku7d: 400, purchasesOtherSku7d: 1, unitsSoldOtherSku7d: 1 }
    const rows = parseSupplementalRows([raw], range, 'purchasedProduct')
    const source = supplementalWorkspaceSource(replaceSupplementalWindow(null, range, rows, '123', 'purchasedProduct', 'now'))
    expect(source.dataset.facts[0]).toMatchObject({ productId: 'white', purchasedProductId: 'B087654321', attributedSales: 400, spend: null, impressions: null, clicks: null })
    expect(source.dataset.facts[0].units).toBe(1)
    const old = { ...raw } as Record<string, unknown>
    delete old.salesOtherSku7d; delete old.purchasesOtherSku7d; delete old.unitsSoldOtherSku7d
    expect(supplementalWorkspaceSource(replaceSupplementalWindow(null, range, [old], '123', 'purchasedProduct', 'now')).dataset.facts[0]).toMatchObject({ attributedSales: null, units: null })
    expect(() => parseSupplementalRows([{ ...raw, purchasedAsin: '' }], range, 'purchasedProduct')).toThrow('missing advertised/purchased')
  })
  it('replaces complete source windows including zero rows without duplicating search spend', () => {
    const initial = replaceSupplementalWindow(null, range, [search], '123', 'searchTerm', 'now')
    const updated = replaceSupplementalWindow(initial, range, [{ ...search, cost: 70 }], '123', 'searchTerm', 'later')
    expect(updated.rows).toHaveLength(1); expect(updated.rows[0].cost).toBe(70)
    expect(replaceSupplementalWindow(updated, range, [], '123', 'searchTerm', 'later').rows).toEqual([])
    expect(replaceSupplementalWindow(initial, { from: '2026-11-20', to: '2026-11-21' }, [], '123', 'searchTerm', 'later').minDate).toBe('2026-11-20')
  })
})
