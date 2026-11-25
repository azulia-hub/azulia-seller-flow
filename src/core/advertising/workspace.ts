/** Generic performance observations. A query uses one authoritative dataset. */
export type AdvertisingGrain = 'PRODUCT' | 'CAMPAIGN' | 'SEARCH_TERM' | 'TARGET' | 'PURCHASED_PRODUCT'
export type AdvertisingScope =
  | { readonly kind: 'ACCOUNT' }
  | { readonly kind: 'PRODUCT'; readonly productId: string }
  | { readonly kind: 'GROUP'; readonly groupId: string; readonly version: number; readonly productIds: readonly string[] }

export interface AdvertisingFact {
  readonly id: string
  readonly datasetId: string
  readonly date: string
  readonly productId: string | null
  readonly campaignId: string | null
  readonly adGroupId: string | null
  readonly targetId?: string | null
  readonly searchTerm?: string | null
  readonly purchasedProductId?: string | null
  readonly spend: number | null
  readonly attributedSales: number | null
  readonly promotedSales: number | null
  readonly otherProductSales: number | null
  readonly impressions: number | null
  readonly clicks: number | null
  readonly purchases: number | null
  readonly units: number | null
  readonly raw?: Readonly<Record<string, unknown>>
}
export interface AdvertisingDataset {
  readonly id: string
  readonly grain: AdvertisingGrain
  readonly currency: string
  readonly moneyDecimals: number
  readonly timezone: string
  readonly taxBasis: 'EXCLUDING_TAX' | 'INCLUDING_TAX' | 'UNKNOWN'
  readonly attributionDays: number
  readonly facts: readonly AdvertisingFact[]
}
export interface AdvertisingMetrics {
  readonly spend: number | null
  readonly attributedSales: number | null
  readonly promotedSales: number | null
  readonly otherProductSales: number | null
  readonly impressions: number | null
  readonly clicks: number | null
  readonly purchases: number | null
  readonly units: number | null
  readonly acos: number | null
  readonly roas: number | null
  readonly cpc: number | null
  readonly ctr: number | null
  readonly conversionRate: number | null
  readonly totalProductSales: number | null
  readonly tacos: number | null
  readonly profitAfterAds: number | null
}
export interface AdvertisingGroup {
  readonly id: string
  readonly name: string
  readonly version: number
  readonly productIds: readonly string[]
  readonly origin: 'MANUAL' | 'CATALOG'
  readonly parentId?: string
}
export interface AdvertisingQuery {
  readonly from: string
  readonly to: string
  readonly scope: AdvertisingScope
  readonly campaignId?: string
}
const divide = (a: number | null, b: number | null, scale = 1) => a !== null && b !== null && b > 0 ? a / b * scale : null

type AdditiveMetric = 'spend' | 'attributedSales' | 'promotedSales' | 'otherProductSales' | 'impressions' | 'clicks' | 'purchases' | 'units'

function sumAdvertisingMetric<K extends AdditiveMetric>(rows: readonly Readonly<Record<K, number | null>>[], field: K, scale: number): number | null {
  let total = 0
  for (const row of rows) {
    const value = row[field]
    if (value === null) return null
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid advertising ${field}; no source observations were discarded.`)
    const amount = scale ? Math.round(value * scale) : value
    if (scale && !Number.isSafeInteger(amount)) throw new Error('Advertising amount exceeds safe currency precision.')
    total += amount
    if (scale && !Number.isSafeInteger(total)) throw new Error('Advertising total exceeds safe currency precision.')
  }
  return scale ? total / scale : total
}

export type AdvertisingPerformanceTotals = Pick<AdvertisingMetrics, 'spend' | 'attributedSales' | 'purchases' | 'acos'>

/** Combine disjoint, already-filtered performance rows. */
export function summarizeAdvertisingPerformance(rows: readonly Omit<AdvertisingPerformanceTotals, 'acos'>[], moneyDecimals: number): AdvertisingPerformanceTotals {
  const scale = 10 ** moneyDecimals
  const spend = sumAdvertisingMetric(rows, 'spend', scale)
  const attributedSales = sumAdvertisingMetric(rows, 'attributedSales', scale)
  return { spend, attributedSales, purchases: sumAdvertisingMetric(rows, 'purchases', 0), acos: divide(spend, attributedSales, 100) }
}

/** Ratios are recomputed from summed bases; overlapping sources/observations fail. */
export function aggregateAdvertisingFacts(dataset: AdvertisingDataset, query: AdvertisingQuery): {
  metrics: AdvertisingMetrics; includedFactIds: readonly string[]; unassignedProductFacts: number
} {
  if (!Number.isInteger(dataset.moneyDecimals) || dataset.moneyDecimals < 0 || dataset.moneyDecimals > 6) throw new Error('Advertising currency precision is required.')
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
  if (!validDate(query.from) || !validDate(query.to) || query.from > query.to) throw new Error('Choose a valid advertising date range.')
  if (query.scope.kind !== 'ACCOUNT' && !['PRODUCT', 'PURCHASED_PRODUCT'].includes(dataset.grain)) throw new Error('This report does not establish product-level attribution. Use its shared campaign/ad-group evidence.')
  const members = query.scope.kind === 'ACCOUNT' ? null : new Set(query.scope.kind === 'PRODUCT' ? [query.scope.productId] : query.scope.productIds)
  const seen = new Set<string>(), selected: AdvertisingFact[] = []
  let unassignedProductFacts = 0
  for (const fact of dataset.facts) {
    if (fact.datasetId !== dataset.id) throw new Error('Alternative advertising report datasets cannot be added together.')
    if (!fact.id || seen.has(fact.id)) throw new Error('Duplicate advertising observation identity. Replace its completed window before querying.')
    seen.add(fact.id)
    if (!validDate(fact.date)) throw new Error('An advertising observation has no valid date.')
    if (fact.date < query.from || fact.date > query.to || query.campaignId && fact.campaignId !== query.campaignId) continue
    if (members && fact.productId === null) { unassignedProductFacts++; continue }
    if (members && !members.has(fact.productId!)) continue
    selected.push(fact)
  }
  const sum = (field: AdditiveMetric, monetary = false) => sumAdvertisingMetric(selected, field, monetary ? 10 ** dataset.moneyDecimals : 0)
  const spend = sum('spend', true), attributedSales = sum('attributedSales', true), impressions = sum('impressions'), clicks = sum('clicks'), purchases = sum('purchases')
  return { metrics: { spend, attributedSales, promotedSales: sum('promotedSales', true), otherProductSales: sum('otherProductSales', true), impressions, clicks, purchases, units: sum('units'),
    acos: divide(spend, attributedSales, 100), roas: divide(attributedSales, spend), cpc: divide(spend, clicks), ctr: divide(clicks, impressions, 100), conversionRate: divide(purchases, clicks, 100),
    // Financial denominators/profit require the separate validated financial join.
    totalProductSales: null, tacos: null, profitAfterAds: null }, includedFactIds: selected.map(row => row.id), unassignedProductFacts }
}

/** A versioned group is a set, not a second source of observations or spend. */
export function advertisingGroup(input: AdvertisingGroup): AdvertisingGroup {
  if (!input.id.trim() || !input.name.trim() || !Number.isSafeInteger(input.version) || input.version < 1 || !['MANUAL', 'CATALOG'].includes(input.origin)) throw new Error('A named, versioned advertising group is required.')
  const productIds = [...new Set(input.productIds.map(id => id.trim()))]
  if (!productIds.length || productIds.some(id => !id)) throw new Error('Choose at least one explicit product identity for the group.')
  if (input.origin === 'CATALOG' && !input.parentId?.trim()) throw new Error('A catalog group requires a verified parent identity.')
  return { ...input, name: input.name.trim(), productIds }
}

export interface AdvertisingFinancialProduct {
  readonly productId: string
  readonly totalProductSales: number
  readonly contributionBeforeReportedAds: number | null
  readonly completeCosts: boolean
}
/** Financial figures are supplied by the existing financial engine, never Ads attribution. */
export function joinAdvertisingFinancials(metrics: AdvertisingMetrics, products: readonly AdvertisingFinancialProduct[], options: {
  readonly compatible: boolean; readonly expectedProductIds?: readonly string[]; readonly completeCoverage: boolean
}): AdvertisingMetrics {
  if (!options.compatible || !options.completeCoverage) return metrics
  const unique = new Map<string, AdvertisingFinancialProduct>()
  for (const product of products) {
    if (unique.has(product.productId) || !Number.isFinite(product.totalProductSales) || product.totalProductSales < 0) throw new Error('Invalid or duplicate financial product identity in advertising join.')
    unique.set(product.productId, product)
  }
  if (options.expectedProductIds?.some(id => !unique.has(id))) return metrics
  const sales = [...unique.values()].reduce((sum, item) => sum + item.totalProductSales, 0)
  const completeCosts = [...unique.values()].every(item => item.completeCosts && item.contributionBeforeReportedAds !== null && Number.isFinite(item.contributionBeforeReportedAds))
  const contribution = completeCosts ? [...unique.values()].reduce((sum, item) => sum + item.contributionBeforeReportedAds!, 0) : null
  return { ...metrics, totalProductSales: Math.round((sales + Number.EPSILON) * 100) / 100, tacos: divide(metrics.spend, sales, 100),
    profitAfterAds: contribution !== null && metrics.spend !== null ? Math.round((contribution - metrics.spend + Number.EPSILON) * 100) / 100 : null }
}

export type AdvertisingMetricKey = keyof AdvertisingMetrics
export interface AdvertisingMetricChange { readonly value: number; readonly unit: 'PERCENT' | 'PERCENTAGE_POINTS' | 'ABSOLUTE'; readonly favorable: boolean | null }
export function compareAdvertisingMetrics(current: AdvertisingMetrics, previous: AdvertisingMetrics, completeComparableCoverage: boolean): Partial<Record<AdvertisingMetricKey, AdvertisingMetricChange>> {
  if (!completeComparableCoverage) return {}
  const result: Partial<Record<AdvertisingMetricKey, AdvertisingMetricChange>> = {}
  for (const key of Object.keys(current) as AdvertisingMetricKey[]) {
    const now = current[key], before = previous[key]
    if (now === null || before === null) continue
    const percentage = ['acos', 'tacos', 'ctr', 'conversionRate'].includes(key), absolute = key === 'roas'
    if (!percentage && !absolute && before <= 0) continue
    const value = percentage || absolute ? now - before : (now - before) / before * 100
    const favorable = value === 0 || key === 'spend' || key === 'impressions' || key === 'clicks' ? null : ['acos', 'tacos', 'cpc'].includes(key) ? value < 0 : value > 0
    result[key] = { value, unit: percentage ? 'PERCENTAGE_POINTS' : absolute ? 'ABSOLUTE' : 'PERCENT', favorable }
  }
  return result
}

/** Grouped slices retain their single dataset identity and never add another grain. */
export function advertisingDimensions(dataset: AdvertisingDataset, query: AdvertisingQuery, dimension: 'campaignId' | 'productId' | 'date'): readonly { id: string | null; dataset: AdvertisingDataset; metrics: AdvertisingMetrics }[] {
  const selected = new Set(aggregateAdvertisingFacts(dataset, query).includedFactIds)
  const groups = new Map<string | null, AdvertisingFact[]>()
  for (const fact of dataset.facts) if (selected.has(fact.id)) {
    const id = fact[dimension], rows = groups.get(id)
    if (rows) rows.push(fact); else groups.set(id, [fact])
  }
  return [...groups].map(([id, facts]) => {
    const source = { ...dataset, facts }
    return { id, dataset: source, metrics: aggregateAdvertisingFacts(source, { ...query, scope: { kind: 'ACCOUNT' } }).metrics }
  })
}

/** Composite identities keep equal search text in different targets/ad groups distinct. */
export function advertisingBreakdown(dataset: AdvertisingDataset, query: AdvertisingQuery, dimensions: readonly ('campaignId' | 'adGroupId' | 'targetId' | 'searchTerm' | 'productId' | 'purchasedProductId')[]) {
  if (!dimensions.length) throw new Error('Choose a breakdown dimension.')
  const selected = new Set(aggregateAdvertisingFacts(dataset, query).includedFactIds)
  const groups = new Map<string, AdvertisingFact[]>()
  for (const fact of dataset.facts) if (selected.has(fact.id)) {
    const id = JSON.stringify(dimensions.map(key => fact[key] ?? null))
    const rows = groups.get(id)
    if (rows) rows.push(fact); else groups.set(id, [fact])
  }
  return [...groups].map(([id, facts]) => ({ id, facts, metrics: aggregateAdvertisingFacts({ ...dataset, facts }, { ...query, scope: { kind: 'ACCOUNT' } }).metrics }))
}

/** Reusable identity buckets: build once, then retrieve each entity without rescanning. */
export function indexAdvertisingFacts(dataset: AdvertisingDataset, dimensions: readonly ('campaignId' | 'adGroupId' | 'targetId' | 'searchTerm' | 'productId' | 'purchasedProductId')[]): ReadonlyMap<string, readonly AdvertisingFact[]> {
  const groups = new Map<string, AdvertisingFact[]>()
  for (const fact of dataset.facts) {
    const key = JSON.stringify(dimensions.map(dimension => fact[dimension] ?? null))
    const group = groups.get(key)
    if (group) group.push(fact); else groups.set(key, [fact])
  }
  return groups
}
