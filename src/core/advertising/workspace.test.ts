import { describe, expect, it } from 'vitest'
import { advertisingGroup, aggregateAdvertisingFacts, type AdvertisingDataset, type AdvertisingFact } from './workspace'

const fact = (id: string, productId: string | null, spend: number, attributedSales: number): AdvertisingFact => ({ id, datasetId: 'products', date: '2026-11-19', productId, campaignId: 'campaign', adGroupId: 'group', spend, attributedSales, promotedSales: attributedSales, otherProductSales: 0, impressions: 100, clicks: 10, purchases: 1, units: 1, raw: { unknown: 'preserved' } })
const data = (facts: readonly AdvertisingFact[]): AdvertisingDataset => ({ id: 'products', grain: 'PRODUCT', currency: 'INR', moneyDecimals: 2, timezone: 'Asia/Kolkata', taxBasis: 'EXCLUDING_TAX', attributionDays: 7, facts })
const range = { from: '2026-11-01', to: '2026-11-19' }
describe('advertising workspace aggregation', () => {
  it('calculates family ratios from summed bases, never average child ratios', () => {
    const source = data([fact('a', 'white', 900, 5000), fact('b', 'walnut', 100, 1000)])
    const result = aggregateAdvertisingFacts(source, { ...range, scope: { kind: 'GROUP', groupId: 'bedside', version: 1, productIds: ['white', 'walnut', 'white'] } })
    expect(result.metrics.spend).toBe(1000)
    expect(result.metrics.attributedSales).toBe(6000)
    expect(result.metrics.acos).toBeCloseTo(16.6666667)
    expect(result.metrics.acos).not.toBe(14)
    expect(result.metrics.tacos).toBeNull(); expect(result.metrics.profitAfterAds).toBeNull()
  })
  it('requires one source and unique observation IDs instead of double counting alternate reports', () => {
    const first = fact('a', 'sku', 10, 100)
    expect(() => aggregateAdvertisingFacts(data([first, { ...first, id: 'b', datasetId: 'search-terms' }]), { ...range, scope: { kind: 'ACCOUNT' } })).toThrow('cannot be added')
    expect(() => aggregateAdvertisingFacts(data([first, first]), { ...range, scope: { kind: 'ACCOUNT' } })).toThrow('Duplicate')
  })
  it('retains missing metric status and zero-denominator unavailability', () => {
    const result = aggregateAdvertisingFacts(data([{ ...fact('a', 'sku', 10, 0), clicks: null }]), { ...range, scope: { kind: 'ACCOUNT' } })
    expect(result.metrics.acos).toBeNull(); expect(result.metrics.clicks).toBeNull(); expect(result.metrics.cpc).toBeNull()
    expect(result.metrics.roas).toBe(0)
  })
  it('keeps unassigned product evidence visible and rejects unsupported product attribution', () => {
    const source = data([fact('a', null, 50, 100), fact('b', 'sku', 10, 100)])
    const result = aggregateAdvertisingFacts(source, { ...range, scope: { kind: 'PRODUCT', productId: 'sku' } })
    expect(result.metrics.spend).toBe(10); expect(result.unassignedProductFacts).toBe(1)
    expect(() => aggregateAdvertisingFacts({ ...source, grain: 'SEARCH_TERM' }, { ...range, scope: { kind: 'PRODUCT', productId: 'sku' } })).toThrow('does not establish product-level')
    expect(source.facts[0].raw).toEqual({ unknown: 'preserved' })
  })
  it('validates explicit group membership and requires catalog parent evidence', () => {
    expect(advertisingGroup({ id: 'g', name: ' Family ', version: 1, origin: 'MANUAL', productIds: ['a', 'a', 'b'] }).productIds).toEqual(['a', 'b'])
    expect(() => advertisingGroup({ id: 'g', name: 'Family', version: 1, origin: 'CATALOG', productIds: ['a'] })).toThrow('verified parent')
    expect(() => advertisingGroup({ id: 'g', name: 'Family', version: 1, origin: 'MANUAL', productIds: [] })).toThrow('at least one')
  })
})
