import { describe, expect, it } from 'vitest'
import { adsReportRequest, adsWindows, parseAdsRows, replaceAdsWindow } from './report'

const range = { from: '2026-11-01', to: '2026-11-18' }
const raw = { date: '2026-11-02', campaignId: 'c', campaignName: 'Campaign', adGroupId: 'g', advertisedSku: 'SKU', advertisedAsin: 'b012345678', impressions: 30, clicks: 4, cost: 12.45, sales7d: 95, attributedSalesSameSku7d: 80, salesOtherSku7d: 15, purchases7d: 2, unitsSoldClicks7d: 3, newUnknownColumn: 'preserved' }
describe('Amazon Ads reporting adapter', () => {
  it('splits inclusive ranges into non-overlapping 31-day windows and rejects invalid/unavailable dates', () => {
    const windows = adsWindows({ from: '2026-08-17', to: '2026-11-18' }, '2026-11-18')
    expect(windows).toEqual([{ from: '2026-08-17', to: '2026-09-16' }, { from: '2026-09-17', to: '2026-10-17' }, { from: '2026-10-18', to: '2026-11-17' }, { from: '2026-11-18', to: '2026-11-18' }])
    for (const range of [{ from: '2026-08-01', to: '2026-11-18' }, { from: '2026-11-19', to: '2026-11-19' }, { from: '2026-02-30', to: '2026-11-18' }]) expect(() => adsWindows(range, '2026-11-18')).toThrow()
  })
  it('requests daily seven-day click attribution without campaign-state filters', () => {
    expect(adsReportRequest(range)).toMatchObject({ configuration: { reportTypeId: 'spAdvertisedProduct', groupBy: ['advertiser'], timeUnit: 'DAILY', format: 'GZIP_JSON' } })
    expect(adsReportRequest(range).configuration.columns).toContain('attributedSalesSameSku7d')
    expect(adsReportRequest(range).configuration).not.toHaveProperty('filters')
  })
  it('preserves exact source metrics and unknown fields without manufacturing missing zeros', () => {
    const rows = parseAdsRows([raw], range)
    expect(rows[0]).toMatchObject({ spendExcludingTax: 12.45, attributedSales: 95, advertisedSkuSales: 80, otherSkuSales: 15, raw: { newUnknownColumn: 'preserved' } })
    for (const cost of [undefined, null, '', ' ', -1, NaN, Infinity]) expect(() => parseAdsRows([{ ...raw, cost }], range)).toThrow()
    expect(() => parseAdsRows([{ ...raw, advertisedSku: '' }], range)).toThrow('No rows were discarded')
    expect(() => parseAdsRows([{ ...raw, date: '2026-12-01' }], range)).toThrow()
  })
  it('replaces complete windows including empty days without duplicating spend and never claims a coverage gap', () => {
    const initial = replaceAdsWindow(null, range, parseAdsRows([raw], range), '123', 'now')
    const refreshed = replaceAdsWindow(initial, range, parseAdsRows([{ ...raw, cost: 20 }], range), '123', 'later')
    expect(refreshed.rows).toHaveLength(1); expect(refreshed.rows[0].spendExcludingTax).toBe(20)
    expect(replaceAdsWindow(refreshed, range, [], '123', 'later').rows).toEqual([])
    const separated = replaceAdsWindow(initial, { from: '2026-11-20', to: '2026-11-21' }, [], '123', 'later')
    expect(separated.minDate).toBe('2026-11-20')
    expect(replaceAdsWindow(initial, range, [], '456', 'later').rows).toEqual([])
  })
})
