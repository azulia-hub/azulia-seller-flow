import { aggregateAdvertisingFacts, advertisingDimensions, indexAdvertisingFacts, type AdvertisingQuery, type AdvertisingDataset, type AdvertisingMetrics } from '../../core/advertising/workspace'
import { recommendAdvertising } from '../../core/advertising/recommendations'
import { indexNegativeTargeting } from '../../adapters/amazon-ads/negativeTargeting'
import type { AdsEntitySnapshot } from '../../adapters/amazon-ads/entities'
import type { AdsWorkspaceSource } from '../../adapters/amazon-ads/workspaceSource'
import type { AdvertisingEntityRow, AdvertisingWorkspaceModel, AdvertisingDetailModel } from '../../features/advertising-workspace/contract'
import { campaignConfiguration, configuredTargets } from './entityModel'
import type { WorkspaceSupplementalSources } from './supplementalModel'

export function enrichWorkspaceModel(model: AdvertisingWorkspaceModel, source: AdsWorkspaceSource | null, supplemental: WorkspaceSupplementalSources, entities: AdsEntitySnapshot | undefined, asOf: string, detailContext?: AdvertisingQuery | null): AdvertisingWorkspaceModel {
  const cutoff = new Date(Date.parse(asOf) + 330 * 60000 - (source?.dataset.attributionDays ?? 7) * 86400000).toISOString().slice(0, 10)
  const baseQuery: AdvertisingQuery = { ...model.query }, targetAcos = model.query.targetAcos ?? 30
  const searchIndex = supplemental.searchTerm && (model.searchTerms.length || model.detail?.searchTerms.length) ? indexAdvertisingFacts(supplemental.searchTerm.dataset, ['campaignId', 'adGroupId', 'targetId', 'searchTerm']) : new Map()
  const findNegatives = searchIndex.size && entities ? indexNegativeTargeting(entities) : null
  const targetIndex = supplemental.targeting && model.detail ? indexAdvertisingFacts(supplemental.targeting.dataset, ['campaignId', 'adGroupId', 'targetId']) : new Map()
  const campaignIndex = new Map(entities?.campaigns?.rows.map(row => [String(row.campaignId), campaignConfiguration(entities, String(row.campaignId))]) ?? [])
  const groupedReviews = new Map<string, { campaigns: Map<string | null, AdvertisingMetrics>; products: Map<string | null, AdvertisingMetrics> }>()
  const reviewGroups = (context: AdvertisingQuery) => {
    const key = JSON.stringify(context)
    let groups = groupedReviews.get(key)
    if (!groups) {
      const to = context.to < cutoff ? context.to : cutoff
      const q = context.from <= to ? { ...context, to } : context
      groups = { campaigns: new Map(source ? advertisingDimensions(source.dataset, q, 'campaignId').map(item => [item.id, item.metrics]) : []), products: new Map(source ? advertisingDimensions(source.dataset, q, 'productId').map(item => [item.id, item.metrics]) : []) }
      groupedReviews.set(key, groups)
    }
    return groups
  }
  const review = (dataset: AdvertisingDataset | undefined, context: AdvertisingQuery, currentBid?: number | null, status?: string | null, coverageSource = source) => {
    const to = context.to < cutoff ? context.to : cutoff, hasMature = context.from <= to
    const q = hasMature ? { ...context, to } : context
    const metrics = aggregateAdvertisingFacts(dataset ?? { id: 'empty', facts: [], grain: 'PRODUCT', moneyDecimals: 2, currency: model.currency, timezone: model.timezone, taxBasis: 'UNKNOWN', attributionDays: 7 }, q).metrics
    return recommendAdvertising(metrics, { completeCoverage: Boolean(dataset && hasMature && coverageSource && coverageSource.coveredFrom <= context.from && coverageSource.coveredTo >= to), targetAcos, currentBid, status })
  }
  const row = (item: AdvertisingEntityRow, context: AdvertisingQuery): AdvertisingEntityRow => {
    const config = item.entity.kind === 'CAMPAIGN' ? campaignIndex.get(item.entity.id) : null
    let recommendation
    let negativeMatches: AdvertisingEntityRow['negativeMatches']
    if (item.entity.kind === 'SEARCH_TERM') {
      const facts = searchIndex.get(item.entity.id)
      if (findNegatives && facts?.length) {
        const fact = facts[0]
        const term = fact.searchTerm
        if (term) negativeMatches = findNegatives(term, fact.campaignId, fact.adGroupId)
      }
      recommendation = review(supplemental.searchTerm ? { ...supplemental.searchTerm.dataset, facts: facts ?? [] } : undefined, { ...context, scope: { kind: 'ACCOUNT' } }, null, null, supplemental.searchTerm)
    } else {
      const metrics = item.entity.kind === 'CAMPAIGN' ? reviewGroups(context).campaigns.get(item.entity.id) : reviewGroups(context).products.get(item.entity.id)
      const to = context.to < cutoff ? context.to : cutoff
      recommendation = metrics ? recommendAdvertising(metrics, { completeCoverage: Boolean(source && context.from <= to && source.coveredFrom <= context.from && source.coveredTo >= to), targetAcos, status: config?.status }) : review(source ? { ...source.dataset, facts: [] } : undefined, context, null, config?.status)
    }
    return { ...item, status: config?.status ?? item.status, recommendation, negativeMatches,
      note: `${recommendation.text}. ${recommendation.reason}${config ? ` Status observed ${config.observedAt}.` : ''}`,
      imageAsin: item.imageAsin ?? (item.entity.kind === 'PRODUCT' ? source?.products.get(item.entity.id)?.asins[0] : null) }
  }
  let detail: AdvertisingDetailModel | null = model.detail
  if (detail) {
    const group = detail.entity.kind === 'GROUP' ? model.groups.find(item => item.id === detail!.entity.id) : null
    const context: AdvertisingQuery = { ...baseQuery, ...detailContext, from: baseQuery.from, to: baseQuery.to,
      ...(detail.entity.kind === 'PRODUCT' ? { scope: { kind: 'PRODUCT' as const, productId: detail.entity.id } } : group ? { scope: { kind: 'GROUP' as const, groupId: group.id, version: group.version, productIds: group.productIds } } : detail.entity.kind === 'CAMPAIGN' ? { campaignId: detail.entity.id } : {}) }
    const configured = detail.entity.kind === 'SEARCH_TERM' ? [] : configuredTargets(source, supplemental.targeting, entities, context)
    const ids = new Set(configured.map(item => item.id))
    const targets = [...configured, ...detail.targets.filter(item => !ids.has(item.id))].map(item => {
      const facts = targetIndex.get(item.id)
      const freshBid = item.observedAt && Date.parse(asOf) - Date.parse(item.observedAt) <= 30 * 60000 ? item.configuredBid : null
      return { ...item, imageAsin: item.name.match(/\bB[A-Z0-9]{9}\b/i)?.[0].toUpperCase() ?? null, recommendation: review(supplemental.targeting ? { ...supplemental.targeting.dataset, facts: facts ?? [] } : undefined, { ...context, scope: { kind: 'ACCOUNT' } }, freshBid, item.effectiveStatus ?? item.status, supplemental.targeting) }
    })
    detail = { ...detail, imageAsin: detail.entity.kind === 'PRODUCT' ? source?.products.get(detail.entity.id)?.asins[0] : detail.entity.kind === 'SEARCH_TERM' && /^B[A-Z0-9]{9}$/i.test(detail.title) ? detail.title.toUpperCase() : null,
      campaigns: detail.campaigns.map(item => row(item, context)), products: detail.products.map(item => row(item, context)), searchTerms: detail.searchTerms.map(item => row(item, context)), targets,
      availableSections: targets.length && !detail.availableSections.includes('targets') ? [...detail.availableSections, 'targets'] : detail.availableSections,
      notices: [...detail.notices.filter(value => !value.includes('Current configured bids')), 'Configured bids and status are current observed settings, not historical settings. Target and search-term performance can cover shared ad groups.'] }
  }
  return { ...model, campaigns: model.campaigns.map(item => row(item, baseQuery)), products: model.products.map(item => row(item, baseQuery)), searchTerms: model.searchTerms.map(item => row(item, baseQuery)), detail,
    notices: [...model.notices, `Review target ACOS: ${targetAcos}% (editable; not a verified break-even target). Suggestions use dates through ${cutoff}, exclude the latest seven-day attribution window, and never change Amazon bids automatically.`] }
}
