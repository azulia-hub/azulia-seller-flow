import type { AdvertisingNegativeMatch } from '../../features/advertising-workspace/contract'
import type { AdsEntitySnapshot } from './entities'

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')
const sources = [
  ['campaignNegativeKeywords', 'Campaign', true],
  ['negativeKeywords', 'Ad group', true],
  ['campaignNegativeTargets', 'Campaign', false],
  ['negativeTargets', 'Ad group', false],
] as const

export function indexNegativeTargeting(snapshot: AdsEntitySnapshot | undefined) {
  const campaigns = new Map<string, Map<string, AdvertisingNegativeMatch>>()
  const adGroups = new Map<string, Map<string, AdvertisingNegativeMatch>>()
  for (const [kind, scope, keyword] of sources) {
    const reading = snapshot?.[kind]
    if (!reading?.complete) continue
    for (const row of reading.rows) {
      if (row.state !== 'ENABLED') continue
      const campaignId = String(row.campaignId ?? '')
      const adGroupId = scope === 'Ad group' ? String(row.adGroupId ?? '') : undefined
      if (!campaignId || adGroupId === '') continue

      let value: unknown
      let type: AdvertisingNegativeMatch['type']
      if (keyword) {
        if (row.matchType !== 'NEGATIVE_EXACT' && row.matchType !== 'NEGATIVE_PHRASE') continue
        type = row.matchType === 'NEGATIVE_EXACT' ? 'Exact keyword' : 'Phrase keyword'
        value = row.keywordText
      } else {
        const expression = Array.isArray(row.resolvedExpression) && row.resolvedExpression.length
          ? row.resolvedExpression : row.expression
        if (!Array.isArray(expression) || expression.length !== 1 || expression[0]?.type !== 'ASIN_SAME_AS') continue
        type = 'ASIN'
        value = expression[0].value
        if (typeof value !== 'string' || !/^[a-z0-9]{10}$/i.test(value)) continue
      }
      if (typeof value !== 'string' || !normalize(value)) continue
      const index = adGroupId ? adGroups : campaigns
      const key = adGroupId ? JSON.stringify([campaignId, adGroupId]) : campaignId
      const matches = index.get(key) ?? new Map<string, AdvertisingNegativeMatch>()
      matches.set(JSON.stringify([type, normalize(value)]), { value, type, scope, observedAt: reading.observedAt })
      index.set(key, matches)
    }
  }

  return (term: string, campaignId: string | null | undefined, adGroupId: string | null | undefined) => {
    if (!campaignId) return []
    const normalized = normalize(term)
    if (!normalized) return []
    const scopes = [campaigns.get(campaignId), adGroupId ? adGroups.get(adGroupId) : undefined]
    const matches: AdvertisingNegativeMatch[] = []
    for (const scope of scopes) {
      if (!scope) continue
      const include = (type: AdvertisingNegativeMatch['type'], value: string) => {
        const match = scope.get(JSON.stringify([type, value]))
        if (match) matches.push(match)
      }
      include('ASIN', normalized)
      include('Exact keyword', normalized)
      const words = normalized.split(' ')
      const phrases = new Set<string>()
      for (let start = 0; start < words.length; start++) {
        // Sponsored Products negative phrases contain up to four words.
        for (let end = start + 1; end <= Math.min(start + 4, words.length); end++) {
          phrases.add(words.slice(start, end).join(' '))
        }
      }
      for (const phrase of phrases) include('Phrase keyword', phrase)
    }
    return matches
  }
}
