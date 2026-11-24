export const adsEntitySpecs = {
  campaigns: ['campaigns', 'spCampaign'], adGroups: ['adGroups', 'spAdGroup'], keywords: ['keywords', 'spKeyword'], targets: ['targetingClauses', 'spTargetingClause'], productAds: ['productAds', 'spProductAd'],
  negativeKeywords: ['negativeKeywords', 'spNegativeKeyword'],
  campaignNegativeKeywords: ['campaignNegativeKeywords', 'spCampaignNegativeKeyword'],
  negativeTargets: ['negativeTargetingClauses', 'spNegativeTargetingClause'],
  campaignNegativeTargets: ['campaignNegativeTargetingClauses', 'spCampaignNegativeTargetingClause'],
} as const
export type AdsEntityKind = keyof typeof adsEntitySpecs
export const adsEntityKinds = Object.keys(adsEntitySpecs) as AdsEntityKind[]
export function entityKind(value: unknown): AdsEntityKind { if (typeof value !== 'string' || !Object.hasOwn(adsEntitySpecs, value)) throw new Error('Unsupported advertising entity.'); return value as AdsEntityKind }
export function entityRequest(kind: AdsEntityKind, nextToken?: string | null) {
  entityKind(kind)
  if (nextToken && (nextToken.length > 8000 || /[\r\n\x00]/.test(nextToken))) throw new Error('Invalid advertising continuation.')
  return { path: `/sp/${kind}/list`, media: `application/vnd.${adsEntitySpecs[kind][1]}.v3+json`, body: { maxResults: 100, stateFilter: { include: ['ENABLED', 'PAUSED', 'ARCHIVED'] }, ...(nextToken ? { nextToken } : {}) } }
}
export interface AdsEntityPage { kind: AdsEntityKind; profileId: string; observedAt: string; rows: readonly Readonly<Record<string, unknown>>[]; nextToken: string | null }
export type AdsEntitySnapshot = Partial<Record<AdsEntityKind, { rows: readonly Readonly<Record<string, unknown>>[]; observedAt: string; complete: boolean }>>
export function parseEntityPage(kind: AdsEntityKind, value: unknown, profileId: string, observedAt: string): AdsEntityPage {
  const body = value as Record<string, unknown> | null, rows = body?.[adsEntitySpecs[kind][0]]
  if (!Array.isArray(rows) || rows.length > 1000 || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('Invalid advertising configuration response. Previous configuration retained.')
  const identifier = (value: unknown) => typeof value === 'string' && value.length > 0 || typeof value === 'number' && Number.isSafeInteger(value)
  for (const row of rows as Record<string, unknown>[]) {
    const fields = ['campaignId', ...(kind === 'campaigns' || kind === 'campaignNegativeKeywords' || kind === 'campaignNegativeTargets' ? [] : ['adGroupId']), ...(kind === 'keywords' ? ['keywordId'] : kind === 'targets' ? ['targetId'] : kind === 'productAds' ? ['adId'] : [])]
    if (fields.some(field => !identifier(row[field]))) throw new Error('Advertising configuration has missing or unsafe identities. Previous complete configuration retained.')
  }
  const nextToken = body?.nextToken
  if (nextToken !== undefined && nextToken !== null && (typeof nextToken !== 'string' || nextToken.length > 8000)) throw new Error('Invalid advertising continuation.')
  return { kind, profileId, observedAt, rows, nextToken: typeof nextToken === 'string' && nextToken ? nextToken : null }
}
