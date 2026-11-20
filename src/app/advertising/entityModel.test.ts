import { expect, it } from 'vitest'
import { configuredTargets, campaignConfiguration } from './entityModel'
import { entityRequest, parseEntityPage, type AdsEntitySnapshot } from '../../adapters/amazon-ads/entities'
const snapshot: AdsEntitySnapshot = { campaigns: { rows: [{ campaignId: 'c', state: 'PAUSED' }], complete: true, observedAt: 'now' }, adGroups: { rows: [{ campaignId: 'c', adGroupId: 'g', defaultBid: 7 }], complete: true, observedAt: 'now' }, keywords: { rows: [{ campaignId: 'c', adGroupId: 'g', keywordId: 'k', keywordText: 'desk', state: 'ENABLED', matchType: 'EXACT' }], complete: true, observedAt: 'now' }, productAds: { rows: [{ campaignId: 'c', adGroupId: 'g', sku: 'white' }], complete: true, observedAt: 'now' } }
it('uses authoritative IDs/state and inherits group bids even for configured products without performance rows', () => {
  expect(campaignConfiguration(snapshot, 'c')?.status).toBe('PAUSED')
  const rows = configuredTargets(null, null, snapshot, { from: '2026-11-01', to: '2026-11-10', scope: { kind: 'PRODUCT', productId: 'white' } })
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ name: 'desk', configuredBid: 7, bidSource: 'AD_GROUP_DEFAULT', metrics: null })
  expect(configuredTargets(null, null, snapshot, { from: '2026-11-01', to: '2026-11-10', scope: { kind: 'PRODUCT', productId: 'other' } })).toEqual([])
})
it('restricts entity requests to read-only list endpoints and preserves unknown raw configuration', () => {
  expect(entityRequest('keywords')).toMatchObject({ path: '/sp/keywords/list', media: 'application/vnd.spKeyword.v3+json' })
  expect(() => entityRequest('delete' as never)).toThrow()
  expect(parseEntityPage('keywords', { keywords: [{ keywordId: 'k', campaignId: 'c', adGroupId: 'g', future: true }], nextToken: 'next' }, '123', 'now')).toMatchObject({ nextToken: 'next', rows: [{ future: true }] })
  expect(() => parseEntityPage('campaigns', { campaigns: null }, '123', 'now')).toThrow()
})
