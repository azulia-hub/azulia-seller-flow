import type { AdsEntitySnapshot } from '../../adapters/amazon-ads/entities'
import type { AdsWorkspaceSource } from '../../adapters/amazon-ads/workspaceSource'
import { aggregateAdvertisingFacts, type AdvertisingQuery } from '../../core/advertising/workspace'
import type { AdvertisingTargetRow } from '../../features/advertising-workspace/contract'

const id = (value: unknown) => typeof value === 'string' ? value : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : ''
const state = (raw: Readonly<Record<string, unknown>>) => ['ENABLED', 'PAUSED', 'ARCHIVED'].includes(String(raw.state).toUpperCase()) ? String(raw.state).toUpperCase() : null
const money = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
export function campaignConfiguration(snapshot: AdsEntitySnapshot | undefined, campaignId: string) {
  const raw = snapshot?.campaigns?.rows.find(row => id(row.campaignId) === campaignId)
  return raw ? { status: state(raw), observedAt: snapshot!.campaigns!.observedAt } : null
}
export function configuredTargets(primary: AdsWorkspaceSource | null, performance: AdsWorkspaceSource | null | undefined, snapshot: AdsEntitySnapshot | undefined, query: AdvertisingQuery): AdvertisingTargetRow[] {
  if (!snapshot) return []
  const selected = new Set(primary ? aggregateAdvertisingFacts(primary.dataset, query).includedFactIds : [])
  const groups = new Set(primary?.dataset.facts.filter(fact => selected.has(fact.id)).map(fact => fact.adGroupId) ?? [])
  // Configured product ads also include targets in ad groups with no historical impressions.
  if (query.scope.kind !== 'ACCOUNT') {
    const members = new Set(query.scope.kind === 'PRODUCT' ? [query.scope.productId] : query.scope.productIds)
    for (const row of snapshot.productAds?.rows ?? []) if (members.has(id(row.sku))) groups.add(JSON.stringify([id(row.campaignId), id(row.adGroupId)]))
  }
  const adGroups = new Map(snapshot.adGroups?.rows.map(row => [JSON.stringify([id(row.campaignId), id(row.adGroupId)]), row]) ?? [])
  const rows: AdvertisingTargetRow[] = []
  for (const kind of ['keywords', 'targets'] as const) for (const raw of snapshot[kind]?.rows ?? []) {
    const campaignId = id(raw.campaignId), adGroupId = JSON.stringify([campaignId, id(raw.adGroupId)]), targetId = id(raw.keywordId ?? raw.targetId)
    if (query.campaignId && query.campaignId !== campaignId || query.scope.kind !== 'ACCOUNT' && !groups.has(adGroupId)) continue
    const group = adGroups.get(adGroupId), ownBid = money(raw.bid), defaultBid = money(group?.defaultBid)
    const expression = Array.isArray(raw.expression) ? raw.expression.map(value => { const part = value as { type?: string; value?: string }; return [part.type, part.value].filter(Boolean).join(': ') }).join(' · ') : ''
    const facts = performance?.dataset.facts.filter(fact => fact.campaignId === campaignId && fact.adGroupId === adGroupId && fact.targetId === targetId) ?? []
    const campaignState = campaignConfiguration(snapshot, campaignId)?.status, groupState = group ? state(group) : null
    const effectiveStatus = campaignState && campaignState !== 'ENABLED' ? `Campaign ${campaignState}` : groupState && groupState !== 'ENABLED' ? `Ad group ${groupState}` : state(raw)
    rows.push({ effectiveStatus, id: JSON.stringify([campaignId, adGroupId, targetId]), name: id(raw.keywordText) || expression || targetId, matchType: id(raw.matchType) || (kind === 'targets' ? 'PRODUCT / AUTO' : null),
      status: state(raw), configuredBid: ownBid ?? defaultBid, bidSource: ownBid ? 'TARGET' : defaultBid ? 'AD_GROUP_DEFAULT' : 'UNKNOWN', observedAt: snapshot[kind]!.observedAt,
      metrics: facts.length && performance ? aggregateAdvertisingFacts({ ...performance.dataset, facts }, { ...query, scope: { kind: 'ACCOUNT' } }).metrics : null })
  }
  return rows
}
