import { expect, it } from 'vitest'
import { aggregateAdvertisingFacts, indexAdvertisingFacts } from '../../core/advertising/workspace'
import { resolveWorkspaceProducts, sponsoredWorkspaceSource } from '../../adapters/amazon-ads/workspaceSource'
import type { CanonicalFinancialEvent } from '../../core/data/types'
import { replaceSupplementalWindow, supplementalWorkspaceSource } from '../../adapters/amazon-ads/supplemental'
import { buildAdvertisingWorkspaceModel } from './buildWorkspaceModel'
import { enrichWorkspaceModel } from './enrichWorkspaceModel'
import { calculateAdvertisingWorkspace } from './calculateWorkspace'
import type { AdvertisingViewQuery } from '../../features/advertising-workspace/contract'

const range = { from: '2026-11-01', to: '2026-11-21' }
const query: AdvertisingViewQuery = { ...range, view: 'overview', scope: { kind: 'ACCOUNT' }, search: '', sort: 'SPEND', direction: 'DESC', page: 1 }
const source = sponsoredWorkspaceSource({ id: 'primary', importedAt: '2026-11-22T00:00:00Z', fileName: 'Synthetic', minDate: range.from, maxDate: range.to, rows: [{ date: '2026-11-10', advertisedSku: 'SKU', advertisedAsin: 'B000000001', campaign: 'Campaign', adGroup: 'Group', portfolio: '', spendExcludingTax: 100, attributedSales: 500, advertisedSkuSales: 400, otherSkuSales: 100, impressions: 1000, clicks: 50, orders: 5, units: 5, raw: { campaignId: 'c', adGroupId: 'g' } }] })
function supplemental() {
  return supplementalWorkspaceSource(replaceSupplementalWindow(null, range, Array.from({ length: 10000 }, (_, i) => ({ date: '2026-11-10', campaignId: 'c', adGroupId: 'g', keywordId: `k${i % 200}`, searchTerm: `term ${i % 6000}`, keyword: `keyword ${i % 200}`, impressions: 10, clicks: 2, cost: 1, sales7d: 4, attributedSalesSameSku7d: 3, salesOtherSku7d: 1, purchases7d: 1, unitsSoldClicks7d: 1 })), '123', 'searchTerm', '2026-11-22T00:00:00Z'))
}
const input = { source, query, advertiser: 'Synthetic', asOf: '2026-11-22T00:00:00Z', financial: null, groups: [], selectedEntity: null, refreshing: false, error: null }

it('does not build off-screen search rows and keeps all headline observations', () => {
  const searchTerm = supplemental()
  const model = buildAdvertisingWorkspaceModel({ ...input, supplemental: { searchTerm } })
  expect(model.searchTerms).toEqual([])
  expect(model.summary.find(item => item.id === 'spend')?.value).toBe(100)
  const terms = buildAdvertisingWorkspaceModel({ ...input, query: { ...query, view: 'searchTerms' }, supplemental: { searchTerm } })
  expect(terms.totalRows).toBe(6000)
  expect(terms.searchTerms).toHaveLength(30)
})

it('indexes once instead of scanning every source row per visible recommendation', () => {
  const searchTerm = supplemental()
  const model = buildAdvertisingWorkspaceModel({ ...input, query: { ...query, view: 'searchTerms' }, supplemental: { searchTerm } })
  let reads = 0
  const instrumented = { ...searchTerm, dataset: { ...searchTerm.dataset, facts: searchTerm.dataset.facts.map(fact => ({ ...fact, get searchTerm() { reads++; return fact.searchTerm } })) } }
  const result = enrichWorkspaceModel(model, source, { searchTerm: instrumented }, undefined, input.asOf)
  expect(reads).toBeLessThanOrEqual(10000)
  expect(result.searchTerms).toHaveLength(30)
  const buckets = indexAdvertisingFacts(searchTerm.dataset, ['campaignId', 'adGroupId', 'targetId', 'searchTerm'])
  const first = result.searchTerms[0]
  const metrics = aggregateAdvertisingFacts({ ...searchTerm.dataset, facts: buckets.get(first.entity.id)! }, { ...query, scope: { kind: 'ACCOUNT' } }).metrics
  expect(first.metrics).toEqual(metrics)
  expect(first.recommendation).toBeDefined()
})

it('attaches synced exclusions to the actual search-term row without changing performance', () => {
  const searchTerm = supplemental()
  const selection = { ...input, query: { ...query, view: 'searchTerms' as const, search: 'term 1' }, supplemental: { searchTerm } }
  const baseline = buildAdvertisingWorkspaceModel(selection)
  const result = enrichWorkspaceModel(baseline, source, { searchTerm }, {
    negativeKeywords: {
      complete: true, observedAt: input.asOf,
      rows: [{ campaignId: 'c', adGroupId: 'g', keywordText: 'Term 1', matchType: 'NEGATIVE_EXACT', state: 'ENABLED' }],
    },
  }, input.asOf)
  const term = result.searchTerms.find(row => row.name === 'term 1')
  expect(term?.negativeMatches).toMatchObject([{ scope: 'Ad group', type: 'Exact keyword' }])
  expect(term?.metrics).toEqual(baseline.searchTerms.find(row => row.name === 'term 1')?.metrics)
  expect(result.searchTerms.filter(row => row.negativeMatches?.length)).toEqual([term])
})

it('accepts structured-cloneable worker input and preserves explicit SKU aliases', () => {
  const sale: CanonicalFinancialEvent = { id: 'sale', source: 'synthetic', sourceDatasetId: 'financial', sourceRow: 1, date: '2026-11-10', orderId: 'order', sku: 'SKU-MFN', event: 'SALE', quantity: 2, amount: 1000, amountClass: 'OPERATING', amountType: 'PRODUCT_REVENUE', state: null, city: null, status: null, rawType: 'Order', rawDescription: 'Item', classified: true, raw: {} }
  const workerInput = structuredClone({ ...input, query: { ...query, view: 'products' as const }, source: resolveWorkspaceProducts(source, new Map([['SKU', 'SKU-MFN']])), financialInput: { events: [sale], costs: [{ sku: 'SKU', unitCost: 20, updatedAt: '2026-11-01' }], policy: 'BLOCK' as const, compatible: true, uploadedFrom: range.from, uploadedTo: range.to }, skuAliases: [['SKU-MFN', 'SKU']] as const })
  const result = calculateAdvertisingWorkspace(workerInput)
  expect(result.summary.find(item => item.id === 'spend')?.value).toBe(100)
  expect(result.products[0].metrics.profitAfterAds).toBe(860)
  expect(result.products[0].metrics.tacos).toBe(10)
  expect(calculateAdvertisingWorkspace({ ...workerInput, skuAliases: undefined }).products[0].metrics.profitAfterAds).toBeNull()
})
