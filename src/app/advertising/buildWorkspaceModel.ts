import { getIndiaToday } from '../../core/sync/planner'
import { aggregateAdvertisingFacts, advertisingDimensions, compareAdvertisingMetrics, joinAdvertisingFinancials, type AdvertisingDataset, type AdvertisingFinancialProduct, type AdvertisingMetrics, type AdvertisingQuery } from '../../core/advertising/workspace'
import { rankAdvertisingEfficiency, rankAdvertisingLosses } from '../../core/insights/focusAnalysis'
import type { AdsWorkspaceSource } from '../../adapters/amazon-ads/workspaceSource'
import type { AdvertisingDetailModel, AdvertisingEntity, AdvertisingEntityRow, AdvertisingFinding, AdvertisingGroup, AdvertisingSummaryMetric, AdvertisingTrendPoint, AdvertisingViewQuery, AdvertisingWorkspaceModel } from '../../features/advertising-workspace/contract'
import { supplementalModel, type WorkspaceSupplementalSources } from './supplementalModel'

export interface WorkspaceFinancialContext {
  readonly products: readonly AdvertisingFinancialProduct[]
  readonly completeCoverage: boolean
  readonly compatibleTaxBasis: boolean
}
export interface BuildAdvertisingWorkspaceInput {
  readonly source: AdsWorkspaceSource | null
  readonly query: AdvertisingViewQuery
  readonly advertiser: string
  readonly asOf: string
  readonly financial: WorkspaceFinancialContext | null
  readonly previousFinancial?: WorkspaceFinancialContext | null
  readonly productNames?: ReadonlyMap<string, string>
  readonly groups: readonly AdvertisingGroup[]
  readonly selectedEntity: AdvertisingEntity | null
  readonly refreshing: boolean
  readonly error: string | null
  readonly supplemental?: WorkspaceSupplementalSources
  readonly detailContext?: AdvertisingQuery | null
}
const views = [{ id: 'overview', label: 'Overview' }, { id: 'campaigns', label: 'Campaigns' }, { id: 'products', label: 'Products' }] as const
const emptyDataset: AdvertisingDataset = { id: 'empty', grain: 'PRODUCT', currency: 'INR', timezone: 'Asia/Kolkata', taxBasis: 'EXCLUDING_TAX', attributionDays: 7, moneyDecimals: 2, facts: [] }
function priorRange(query: AdvertisingViewQuery) {
  const days = Math.round((Date.parse(query.to) - Date.parse(query.from)) / 86400000) + 1
  return { from: new Date(Date.parse(query.from) - days * 86400000).toISOString().slice(0, 10), to: new Date(Date.parse(query.from) - 86400000).toISOString().slice(0, 10) }
}
function summary(metrics: AdvertisingMetrics, changes: ReturnType<typeof compareAdvertisingMetrics>, financialReason: string): AdvertisingSummaryMetric[] {
  const definitions = {
    spend: ['Ad spend', 'MONEY', 'Reported Sponsored Products spend before GST. Campaign, product and search-term reports are alternative breakdowns, not extra spend.'],
    attributedSales: ['Sales credited to ads', 'MONEY', 'Total sales credited within seven days of an ad click, including other-product purchases. Not added to financial sales.'],
    acos: ['ACOS', 'PERCENT', 'Reported spend divided by ad-attributed sales, multiplied by 100.'],
    roas: ['ROAS', 'MULTIPLIER', 'Ad-attributed sales divided by reported spend.'],
    tacos: ['TACOS · SP only', 'PERCENT', 'Reported Sponsored Products spend before GST divided by compatible financial product principal before separately reported GST and before refunds.'],
  } as const
  return (Object.keys(definitions) as (keyof typeof definitions)[]).map(id => ({ id, label: definitions[id][0], value: metrics[id], format: definitions[id][1], definition: definitions[id][2], change: changes[id] ?? null,
    ...(metrics[id] === null ? { unavailableReason: id === 'tacos' ? financialReason : id === 'acos' ? 'No positive attributed-sales denominator.' : id === 'roas' ? 'No positive ad-spend denominator.' : 'Source value is unavailable.' } : {}) }))
}

/** Application orchestration only: calculations remain in tested generic selectors. */
export function buildAdvertisingWorkspaceModel(input: BuildAdvertisingWorkspaceInput): AdvertisingWorkspaceModel {
  const { source, query } = input, dataset = source?.dataset ?? emptyDataset
  const analysisQuery: AdvertisingQuery = { from: query.from, to: query.to, scope: query.scope, campaignId: query.campaignId }
  const base = aggregateAdvertisingFacts(dataset, analysisQuery)
  const supplemental = supplementalModel(source, input.supplemental ?? {}, analysisQuery, { searchTerms: query.view === 'searchTerms' || input.selectedEntity?.kind === 'SEARCH_TERM', targets: false, crossSales: false })
  const previous = priorRange(query), sourceCovers = (range: { from: string; to: string }) => Boolean(source && source.coveredFrom <= range.from && source.coveredTo >= range.to)
  const fullCoverage = sourceCovers(query), previousCoverage = sourceCovers(previous)
  const hasCoveredDates = Boolean(source && source.coveredFrom <= query.to && source.coveredTo >= query.from)
  const today = getIndiaToday(Date.parse(input.asOf))
  const closedPeriod = query.to < today
  const notices: string[] = [...(source?.identityNotices ?? []), ...supplemental.notices]
  if (source && !fullCoverage) notices.push('Selected advertising dates are not fully covered. Displayed values are observed results only; comparisons and financial joins are unavailable.')
  if (!closedPeriod) notices.push('This period includes today. Current-day coverage and seven-day conversion attribution can still change; period comparison is unavailable.')
  else notices.push('Seven-day click attribution can revise recent conversion results. Review signals do not prove wasted spend or incremental sales.')
  const financialReason = query.campaignId ? 'Campaign-filtered spend has no defensible campaign-level total business-sales denominator.' : !input.financial?.completeCoverage ? 'Compatible financial coverage is unavailable or incomplete.' : 'No positive compatible financial product-sales denominator.'
  const financialById = new Map(input.financial?.products.map(product => [product.productId, product]) ?? [])
  const finance = (metrics: AdvertisingMetrics, ids: readonly string[] | null, context = input.financial) => {
    const selected = ids ? (context?.products ?? []).filter(product => ids.includes(product.productId)) : context?.products ?? []
    return joinAdvertisingFinancials(metrics, selected, { compatible: Boolean(context?.compatibleTaxBasis && fullCoverage && !query.campaignId), completeCoverage: Boolean(context?.completeCoverage), ...(ids ? { expectedProductIds: ids } : {}) })
  }
  const scopeIds = query.scope.kind === 'ACCOUNT' ? null : query.scope.kind === 'PRODUCT' ? [query.scope.productId] : [...new Set(query.scope.productIds)]
  const metrics = finance(base.metrics, scopeIds)
  const comparable = fullCoverage && previousCoverage && closedPeriod
  const priorQuery = { ...analysisQuery, ...previous }
  const previousMetrics = input.previousFinancial
    ? joinAdvertisingFinancials(aggregateAdvertisingFacts(dataset, priorQuery).metrics, scopeIds ? input.previousFinancial.products.filter(product => scopeIds.includes(product.productId)) : input.previousFinancial.products,
      { compatible: input.previousFinancial.compatibleTaxBasis && !query.campaignId, completeCoverage: input.previousFinancial.completeCoverage, ...(scopeIds ? { expectedProductIds: scopeIds } : {}) })
    : aggregateAdvertisingFacts(dataset, priorQuery).metrics
  const changes = compareAdvertisingMetrics(metrics, previousMetrics, comparable)
  if (!comparable && source) notices.push('Comparison requires both complete equal-length advertising windows and a closed current date range.')
  if (base.unassignedProductFacts) notices.push(`${base.unassignedProductFacts} source observations have no product identity and cannot be assigned to this product selection.`)

  const productName = (id: string) => input.productNames?.get(id) || source?.products.get(id)?.name || id
  const productSlices = advertisingDimensions(dataset, analysisQuery, 'productId')
  const productRows: AdvertisingEntityRow[] = productSlices.map(slice => {
    const id = slice.id ?? 'unidentified-product', rowMetrics = slice.id === null ? slice.metrics : finance(slice.metrics, [id])
    return { entity: { kind: 'PRODUCT', id }, name: slice.id === null ? 'Unidentified advertised product' : productName(id), subtitle: source?.products.get(id)?.asins.join(', '), metrics: rowMetrics, change: null, status: null,
      relatedCampaigns: new Set(slice.dataset.facts.map(fact => fact.campaignId).filter(Boolean)).size,
      note: slice.id === null ? 'Product identity is missing; no financial amounts were assigned.' : !financialById.has(id) ? 'No verified financial SKU match. Ad performance is retained; TACOS and contribution are unavailable.' : undefined }
  })
  // Known financial products with no SP observations can still be selected/grouped.
  const includedProducts = new Set(productRows.map(row => row.entity.id))
  for (const product of fullCoverage ? input.financial?.products ?? [] : []) {
    if (query.campaignId || includedProducts.has(product.productId) || scopeIds && !scopeIds.includes(product.productId)) continue
    const zero = aggregateAdvertisingFacts({ ...dataset, facts: [] }, analysisQuery).metrics
    productRows.push({ entity: { kind: 'PRODUCT', id: product.productId }, name: productName(product.productId), metrics: finance(zero, [product.productId]), change: null, status: null,
      note: fullCoverage ? 'No reported Sponsored Products activity in these dates.' : 'Advertising coverage is incomplete; absence of rows does not establish zero spend.' })
  }
  const campaignSlices = advertisingDimensions(dataset, analysisQuery, 'campaignId')
  const campaignRows: AdvertisingEntityRow[] = campaignSlices.map(slice => ({ entity: { kind: 'CAMPAIGN', id: slice.id ?? 'unidentified-campaign' }, name: slice.id === null ? 'Unidentified campaign' : source?.campaigns.get(slice.id)?.name || slice.id,
    metrics: slice.metrics, change: null, status: null, note: slice.id ? source?.campaigns.get(slice.id)?.note || 'Current status and budget require authoritative campaign metadata.' : 'Campaign identity is unavailable.' }))
  const campaignComparisons = new Map(advertisingDimensions(dataset, priorQuery, 'campaignId').map(slice => [slice.id, slice.metrics]))
  const productComparisons = new Map(advertisingDimensions(dataset, priorQuery, 'productId').map(slice => [slice.id, slice.metrics]))
  const rowChanges = (rows: AdvertisingEntityRow[], prior: ReadonlyMap<string | null, AdvertisingMetrics>) => rows.map(row => ({ ...row, change: prior.has(row.entity.id) ? compareAdvertisingMetrics(row.metrics, prior.get(row.entity.id)!, comparable).spend ?? null : null }))
  const sortRows = (rows: readonly AdvertisingEntityRow[], search = query.search) => {
    const field = { SPEND: 'spend', SALES: 'attributedSales', ACOS: 'acos', ROAS: 'roas', PURCHASES: 'purchases' }[query.sort] as keyof AdvertisingMetrics
    const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return rows.filter(row => tokens.every(token => `${row.name} ${row.subtitle ?? ''}`.toLowerCase().includes(token))).sort((a, b) => {
      const left = a.metrics[field], right = b.metrics[field]
      if (left === null) return right === null ? a.name.localeCompare(b.name) : 1
      if (right === null) return -1
      return (query.direction === 'ASC' ? left - right : right - left) || a.name.localeCompare(b.name)
    })
  }
  const campaigns = sortRows(rowChanges(campaignRows, campaignComparisons)), products = sortRows(rowChanges(productRows, productComparisons)), searchTerms = sortRows(supplemental.searchTerms)
  const campaignReview = rankAdvertisingEfficiency(campaignRows.map(row => ({ id: row.entity.id, label: row.name, value: row.metrics.spend ?? 0, adSpend: row.metrics.spend ?? undefined, sales: row.metrics.attributedSales ?? undefined })))
  const productReview = rankAdvertisingLosses(productRows.map(row => ({ id: row.entity.id, label: row.name, value: 0, adSpend: row.metrics.spend ?? undefined, sales: row.metrics.attributedSales ?? undefined, totalSales: row.metrics.totalProductSales ?? undefined, profitAfterAds: row.metrics.profitAfterAds })))
  const findings: AdvertisingFinding[] = fullCoverage ? [
    ...productReview.rows.map(item => ({ id: `product:${item.id}`, title: item.label, explanation: item.reviewReason ?? 'Review supported product losses after ads.', entity: { kind: 'PRODUCT' as const, id: item.id }, severity: 'REVIEW' as const, evidence: ['Known negative product contribution with TACOS above 20%.', 'Uses existing cost coverage and before-GST advertising policy.'] })),
    ...campaignReview.rows.map(item => ({ id: `campaign:${item.id}`, title: item.label, explanation: item.reviewReason ?? 'Review campaign performance.', entity: { kind: 'CAMPAIGN' as const, id: item.id }, severity: 'REVIEW' as const, evidence: ['Compares reported campaign spend and attributed sales.', 'Review attribution lag and sample size before changing targeting.'] })),
  ].slice(0, 3) : []
  const trend: AdvertisingTrendPoint[] = advertisingDimensions(dataset, analysisQuery, 'date').map(slice => ({ date: slice.id!, metrics: slice.metrics })).sort((a, b) => a.date.localeCompare(b.date))
  let detail: AdvertisingDetailModel | null = null
  if (input.selectedEntity && input.selectedEntity.kind !== 'SEARCH_TERM') {
    const entity = input.selectedEntity, group = entity.kind === 'GROUP' ? input.groups.find(item => item.id === entity.id) : undefined
    const detailBase = input.detailContext ? { ...input.detailContext, from: query.from, to: query.to } : analysisQuery
    const detailQuery: AdvertisingQuery = entity.kind === 'CAMPAIGN' ? { ...detailBase, campaignId: entity.id } : { ...detailBase, scope: group ? { kind: 'GROUP', groupId: group.id, version: group.version, productIds: group.productIds } : { kind: 'PRODUCT', productId: entity.id } }
    const detailIds = detailQuery.scope.kind === 'ACCOUNT' ? null : detailQuery.scope.kind === 'PRODUCT' ? [detailQuery.scope.productId] : detailQuery.scope.productIds
    const detailMetrics = detailQuery.campaignId ? aggregateAdvertisingFacts(dataset, detailQuery).metrics : finance(aggregateAdvertisingFacts(dataset, detailQuery).metrics, detailIds)
    const detailSupplemental = supplementalModel(source, input.supplemental ?? {}, detailQuery)
    const detailCampaignRows: AdvertisingEntityRow[] = advertisingDimensions(dataset, detailQuery, 'campaignId').map(item => ({ entity: { kind: 'CAMPAIGN', id: item.id ?? 'unidentified-campaign' }, name: item.id ? source?.campaigns.get(item.id)?.name || item.id : 'Unidentified campaign', metrics: item.metrics, change: null, status: null, note: 'Performance is restricted to the selected product/group context.' }))
    const detailProductRows: AdvertisingEntityRow[] = advertisingDimensions(dataset, detailQuery, 'productId').map(item => ({ entity: { kind: 'PRODUCT', id: item.id ?? 'unidentified-product' }, name: item.id ? productName(item.id) : 'Unidentified product', metrics: detailQuery.campaignId || item.id === null ? item.metrics : finance(item.metrics, [item.id]), change: null, status: null }))
    detail = { entity, title: group?.name || (entity.kind === 'CAMPAIGN' ? source?.campaigns.get(entity.id)?.name : productName(entity.id)) || entity.id,
      subtitle: group ? `${group.productIds.length} products · group version ${group.version}` : entity.kind === 'CAMPAIGN' ? 'Observed campaign performance; current state is not supplied by this report.' : 'Advertised-product performance and compatible financial context.',
      summary: summary(detailMetrics, {}, entity.kind === 'CAMPAIGN' ? 'Campaign-level total product sales are unavailable.' : financialReason), metrics: detailMetrics,
      campaigns: sortRows(detailCampaignRows, ''), products: sortRows(detailProductRows, ''), searchTerms: detailSupplemental.searchTerms, targets: detailSupplemental.targets, crossSales: detailSupplemental.crossSales,
      trend: advertisingDimensions(dataset, detailQuery, 'date').map(item => ({ date: item.id!, metrics: item.metrics })).sort((a, b) => a.date.localeCompare(b.date)),
      notices: [...detailSupplemental.notices, 'Other-product sales alone do not establish parent membership. Cross-sales are already included in total attributed sales.', 'Current configured bids and status require authoritative metadata; actual CPC is not a bid.'],
      availableSections: [...(entity.kind === 'CAMPAIGN' ? ['summary', 'products'] as const : ['summary', 'campaigns'] as const), ...(input.supplemental?.searchTerm ? ['searchTerms'] as const : []), ...(input.supplemental?.targeting ? ['targets'] as const : []), ...(input.supplemental?.purchasedProduct ? ['crossSales'] as const : [])] }
  }
  if (input.selectedEntity?.kind === 'SEARCH_TERM') {
    const row = supplemental.searchTerms.find(item => item.entity.id === input.selectedEntity!.id)
    if (row) detail = { entity: row.entity, title: row.name, subtitle: row.subtitle ?? '', summary: summary(row.metrics, {}, 'Search terms have no defensible financial sales denominator.'), metrics: row.metrics,
      campaigns: [], products: [], searchTerms: [row], targets: [], crossSales: [], trend: [], notices: [row.note ?? '', ...supplemental.notices], availableSections: ['summary'] }
  }
  const choices = new Map<string, string>()
  for (const [id] of source?.products ?? []) choices.set(id, productName(id))
  for (const product of input.financial?.products ?? []) choices.set(product.productId, productName(product.productId))
  const pageSize = 30, totalRows = query.view === 'campaigns' ? campaigns.length : query.view === 'products' ? products.length : query.view === 'searchTerms' ? searchTerms.length : 0
  const page = Math.min(Math.max(1, query.page), Math.max(1, Math.ceil(totalRows / pageSize)))
  const start = (page - 1) * pageSize
  return { advertiser: input.advertiser, marketplace: 'India', currency: dataset.currency, timezone: dataset.timezone, adProductLabel: 'Sponsored Products', query: { ...query, page },
    availableViews: [...views, ...(input.supplemental?.searchTerm ? [{ id: 'searchTerms' as const, label: 'Search terms' }] : [])], sourceState: input.error && !source ? 'ERROR' : !source ? input.refreshing ? 'LOADING' : 'EMPTY' : !fullCoverage || !closedPeriod ? 'PARTIAL' : dataset.facts.length ? 'READY' : 'EMPTY',
    error: input.error, refreshing: input.refreshing, lastUpdated: source?.observedAt ?? null, coveredFrom: source?.coveredFrom ?? null, coveredTo: source?.coveredTo ?? null,
    basisLabel: 'SP spend before GST · Product revenue before separately reported GST · 7-day click attribution', comparisonLabel: comparable ? `${previous.from} – ${previous.to}` : null,
    notices, summary: summary(hasCoveredDates ? metrics : { ...metrics, spend: null, attributedSales: null, acos: null, roas: null, tacos: null }, changes, financialReason), findings, trend,
    campaigns: query.view === 'campaigns' ? campaigns.slice(start, start + pageSize) : query.view === 'overview' ? campaigns.slice(0, 5) : [], products: query.view === 'products' ? products.slice(start, start + pageSize) : [],
    searchTerms: query.view === 'searchTerms' ? searchTerms.slice(start, start + pageSize) : [], groups: input.groups, productChoices: [...choices].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)), totalRows, pageSize, detail }
}
