import { aggregateAdvertisingFacts, advertisingBreakdown, type AdvertisingQuery } from '../../core/advertising/workspace'
import type { AdsWorkspaceSource } from '../../adapters/amazon-ads/workspaceSource'
import type { AdvertisingCrossSale, AdvertisingEntityRow, AdvertisingTargetRow } from '../../features/advertising-workspace/contract'

export interface WorkspaceSupplementalSources {
  readonly searchTerm?: AdsWorkspaceSource | null
  readonly targeting?: AdsWorkspaceSource | null
  readonly purchasedProduct?: AdsWorkspaceSource | null
}
const label = (value: unknown) => typeof value === 'string' ? value : null

/** Shared ad-group evidence is explicitly separate from SKU-attributed performance. */
export function supplementalModel(primary: AdsWorkspaceSource | null, sources: WorkspaceSupplementalSources, query: AdvertisingQuery) {
  const accountQuery: AdvertisingQuery = { ...query, scope: { kind: 'ACCOUNT' } }
  const productSelection = query.scope.kind !== 'ACCOUNT'
  const included = new Set(primary ? aggregateAdvertisingFacts(primary.dataset, query).includedFactIds : [])
  const observedGroups = new Set(primary ? primary.dataset.facts.filter(fact => included.has(fact.id)).map(fact => fact.adGroupId).filter(Boolean) : [])
  const shared = (source: AdsWorkspaceSource) => ({ ...source.dataset, facts: productSelection ? source.dataset.facts.filter(fact => observedGroups.has(fact.adGroupId)) : source.dataset.facts })
  const notices: string[] = []
  if (productSelection && (sources.searchTerm || sources.targeting)) notices.push('Search terms and targets show whole shared ad groups observed for this selection. Their amounts are not allocated to individual SKUs and are not added to product totals.')
  for (const [kind, source] of Object.entries(sources)) if (source && (source.coveredFrom > query.from || source.coveredTo < query.to)) notices.push(`${kind} evidence has partial date coverage (${source.coveredFrom} – ${source.coveredTo}).`)
  const searchTerms: AdvertisingEntityRow[] = sources.searchTerm ? advertisingBreakdown(shared(sources.searchTerm), accountQuery, ['campaignId', 'adGroupId', 'targetId', 'searchTerm']).map(slice => {
    const fact = slice.facts[0], raw = fact.raw ?? {}
    return { entity: { kind: 'SEARCH_TERM', id: slice.id }, name: fact.searchTerm ?? 'Unknown search term', subtitle: `${sources.searchTerm!.campaigns.get(fact.campaignId ?? '')?.name ?? fact.campaignId} · ${sources.searchTerm!.adGroups.get(fact.adGroupId ?? '')?.name ?? 'Ad group unknown'}`,
      imageAsin: /^B[A-Z0-9]{9}$/i.test(fact.searchTerm ?? '') ? fact.searchTerm!.toUpperCase() : null, metrics: slice.metrics, change: null, status: null, attributionScope: 'SHARED_AD_GROUP', target: label(raw.keyword) ?? label(raw.targeting), matchType: label(raw.matchType),
      note: 'Reported at campaign/ad-group/target level. No individual SKU attribution is supplied.' }
  }) : []
  const targets: AdvertisingTargetRow[] = sources.targeting ? advertisingBreakdown(shared(sources.targeting), accountQuery, ['campaignId', 'adGroupId', 'targetId']).map(slice => {
    const raw = slice.facts[0].raw ?? {}
    return { id: slice.id, name: label(raw.keyword) ?? label(raw.targeting) ?? slice.facts[0].targetId ?? 'Unidentified target', matchType: label(raw.matchType), status: null, configuredBid: null, bidSource: 'UNKNOWN', observedAt: null, metrics: slice.metrics }
  }) : []
  // Only one-to-one ASIN/SKU mappings are defensible. Catalog family is never inferred.
  const asinProducts = new Map<string, Set<string>>()
  for (const product of primary?.products.values() ?? []) for (const asin of product.asins) {
    const key = asin.toUpperCase(), ids = asinProducts.get(key) ?? new Set<string>(); ids.add(product.id); asinProducts.set(key, ids)
  }
  const members = new Set(query.scope.kind === 'GROUP' ? query.scope.productIds : [])
  const crossSales: AdvertisingCrossSale[] = sources.purchasedProduct ? advertisingBreakdown(sources.purchasedProduct.dataset, query, ['productId', 'purchasedProductId']).map(slice => {
    const fact = slice.facts[0], purchasedAsin = fact.purchasedProductId ?? '', ids = asinProducts.get(purchasedAsin), purchasedProduct = ids?.size === 1 ? [...ids][0] : null
    const advertisedProduct = fact.productId ?? 'Unidentified advertised SKU'
    return { id: slice.id, advertisedAsin: label(fact.raw?.advertisedAsin), purchasedAsin, advertisedProduct, purchasedProduct: purchasedProduct ?? (purchasedAsin || null),
      relationship: purchasedProduct === advertisedProduct ? 'SAME_PRODUCT' : purchasedProduct && members.has(advertisedProduct) && members.has(purchasedProduct) ? 'SIBLING' : purchasedProduct && members.size ? 'OUTSIDE_GROUP' : 'UNKNOWN',
      attributedSales: slice.metrics.attributedSales, units: slice.metrics.units,
      evidence: slice.metrics.attributedSales === null ? 'This older observation has no purchased-ASIN halo sales fields. Refresh reports to load the corrected seven-day cross-sale metrics.' : purchasedProduct ? 'Reported advertised SKU → purchased ASIN, uniquely matched to a SKU. Group membership is the selected explicit set; no customer journey is inferred.' : 'Purchased ASIN has no unique SKU match. Family relationship remains unknown. These sales are already included in total ad-attributed sales.' }
  }) : []
  return { searchTerms, targets, crossSales, notices }
}
