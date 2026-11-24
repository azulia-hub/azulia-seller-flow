import { expect, it } from 'vitest'
import { entityRequest, parseEntityPage, type AdsEntityKind } from './entities'
import { indexNegativeTargeting } from './negativeTargeting'

const observedAt = '2026-11-24T09:00:00Z'
const reading = (rows: readonly Record<string, unknown>[]) => ({ complete: true, observedAt, rows })
const keyword = (keywordText: string, matchType = 'NEGATIVE_EXACT') =>
  ({ campaignId: 'c', keywordText, matchType, state: 'ENABLED' })

it('matches enabled exact and whole-phrase exclusions within the configured scope', () => {
  const match = indexNegativeTargeting({
    campaignNegativeKeywords: reading([keyword(' Travel Mug ', 'NEGATIVE_PHRASE'), keyword('cup'), { ...keyword('bottle'), state: 'PAUSED' }]),
    negativeKeywords: reading([{ ...keyword('Travel Mug'), adGroupId: 'g' }, { ...keyword('cup'), adGroupId: 'other' }]),
  })
  expect(match(' TRAVEL   MUG ', 'c', JSON.stringify(['c', 'g']))).toMatchObject([
    { scope: 'Campaign', type: 'Phrase keyword', observedAt },
    { scope: 'Ad group', type: 'Exact keyword', observedAt },
  ])
  expect(match('blue travel mug travel mug', 'c', JSON.stringify(['c', 'g']))).toHaveLength(1)
  expect(match('cup', 'c', JSON.stringify(['c', 'g']))).toMatchObject([{ scope: 'Campaign', type: 'Exact keyword' }])
  for (const term of ['blue cup', 'travel mugs', 'bottle']) expect(match(term, 'c', JSON.stringify(['c', 'g']))).toEqual([])
  expect(match('travel mug', 'unrelated', JSON.stringify(['unrelated', 'g']))).toEqual([])
})

it('matches direct ASIN exclusions and ignores brand expressions and incomplete snapshots', () => {
  const target = (value: string, type = 'ASIN_SAME_AS') =>
    ({ campaignId: 'c', state: 'ENABLED', expression: [{ type, value }] })
  const match = indexNegativeTargeting({
    campaignNegativeTargets: reading([target('0123456789'), target('B087654322', 'ASIN_BRAND_SAME_AS')]),
    negativeTargets: { ...reading([{ ...target('B087654321'), adGroupId: 'g' }]), complete: false },
  })
  expect(match('0123456789', 'c', JSON.stringify(['c', 'g']))).toMatchObject([{ type: 'ASIN', scope: 'Campaign' }])
  expect(match('B087654322', 'c', JSON.stringify(['c', 'g']))).toEqual([])
  expect(match('B087654321', 'c', JSON.stringify(['c', 'g']))).toEqual([])
  const matchGroup = indexNegativeTargeting({ negativeTargets: reading([{ ...target('B087654321'), adGroupId: 'g' }]) })
  expect(matchGroup('b087654321', 'c', JSON.stringify(['c', 'g']))).toMatchObject([{ scope: 'Ad group', type: 'ASIN' }])
  expect(matchGroup('b087654321', 'c', JSON.stringify(['c', 'other']))).toEqual([])
})

it.each([
  ['negativeKeywords', 'negativeKeywords', 'spNegativeKeyword', true],
  ['campaignNegativeKeywords', 'campaignNegativeKeywords', 'spCampaignNegativeKeyword', false],
  ['negativeTargets', 'negativeTargetingClauses', 'spNegativeTargetingClause', true],
  ['campaignNegativeTargets', 'campaignNegativeTargetingClauses', 'spCampaignNegativeTargetingClause', false],
] as const)('reads %s through its scoped list endpoint', (kind: AdsEntityKind, key, media, adGroup) => {
  expect(entityRequest(kind, 'cursor')).toMatchObject({
    path: `/sp/${kind}/list`, media: `application/vnd.${media}.v3+json`, body: { nextToken: 'cursor' },
  })
  const row = { campaignId: 'c', ...(adGroup ? { adGroupId: 'g' } : {}), future: true }
  expect(parseEntityPage(kind, { [key]: [row] }, '123', observedAt).rows).toEqual([row])
  if (adGroup) expect(() => parseEntityPage(kind, { [key]: [{ campaignId: 'c' }] }, '123', observedAt)).toThrow()
})
