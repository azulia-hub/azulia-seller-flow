import { useAdsEntities } from './useAdsEntities'
import { enrichWorkspaceModel } from './enrichWorkspaceModel'
import { useAdsCatalog } from './useAdsCatalog'
import { useEffect, useMemo, useState } from 'react'
import { AdvertisingWorkspaceView } from '../../features/advertising-workspace/ui/AdvertisingWorkspaceView'
import type { AdvertisingEntity, AdvertisingViewQuery, AdvertisingWorkspaceViewProps } from '../../features/advertising-workspace/contract'
import type { CanonicalFinancialEvent } from '../../core/data/types'
import type { ProductCost } from '../../core/costs/types'
import type { MissingCostPolicy } from '../../core/costs/calculateCosts'
import type { SponsoredProductsReport } from '../../core/advertising/types'
import type { SyncRange } from '../../core/sync/ranges'
import { previousEqualRange } from '../../core/analytics/timePeriods'
import { resolveAdvertisingSkus, resolveWorkspaceProducts, sponsoredWorkspaceSource } from '../../adapters/amazon-ads/workspaceSource'
import { advertisingGroupsKey, readAdvertisingGroups, saveAdvertisingGroup, type AdvertisingGroupEntry } from '../../adapters/amazon-ads/groups'
import { validAdsDate, shiftAdsDate } from '../../adapters/amazon-ads/report'
import { buildAdvertisingWorkspaceModel } from './buildWorkspaceModel'
import { advertisingFinancialContext } from './financialContext'
import { useSupplementalAds } from './useSupplementalAds'
import type { AdvertisingQuery } from '../../core/advertising/workspace'
import type { AdsConnection } from '../useAdsConnection'

export interface AdvertisingWorkspaceProps {
  report: SponsoredProductsReport | null
  events: readonly CanonicalFinancialEvent[]
  costs: readonly ProductCost[]
  policy: MissingCostPolicy
  normalizeSku?: (sku: string) => string
  financialCoverage?: readonly SyncRange[]
  financialFrom: string | null
  financialTo: string | null
  financialCompatible: boolean
  financialIdentity: string | null
  from: string
  to: string
  productNames: ReadonlyMap<string, string>
  productImages?: ReadonlyMap<string, string>
  connection: AdsConnection
  initialProduct?: string | null
  onOpenSettings: () => void
  onOpenFinancialProduct: (id: string) => void
  formatMoney: (value: number) => string
}

/** React owns interaction/lifecycle only; selectors own financial and Ads calculations. */
export function AdvertisingWorkspace(props: AdvertisingWorkspaceProps) {
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
  const [query, setQuery] = useState<AdvertisingViewQuery>(() => ({ view: 'overview', from: validAdsDate(props.from) ? props.from : props.report?.minDate ?? shiftAdsDate(today, -29), to: validAdsDate(props.to) ? props.to : props.report?.maxDate ?? today,
    scope: props.initialProduct ? { kind: 'PRODUCT', productId: props.initialProduct } : { kind: 'ACCOUNT' }, search: '', sort: 'SPEND', direction: 'DESC', page: 1 }))
  const [entity, setEntity] = useState<AdvertisingEntity | null>(props.initialProduct ? { kind: 'PRODUCT', id: props.initialProduct } : null)
  const [detailContext, setDetailContext] = useState<AdvertisingQuery | null>(null)
  const [refresh, setRefresh] = useState(0), [queryError, setQueryError] = useState<string | null>(null)
  const [groupState, setGroupState] = useState<{ key: string; entry: AdvertisingGroupEntry } | null>(null), [groupError, setGroupError] = useState<string | null>(null)
  const [groupKey, setGroupKey] = useState<string | null>(null)
  const status = props.connection.status
  const connected = props.connection.enabled && props.connection.supported && Boolean(status?.configured && props.report?.id === `ads-api:${status.profileId}`)
  useEffect(() => { if (props.connection.enabled) void props.connection.requestRange(false, { from: query.from, to: query.to }) }, [props.connection.requestRange, props.connection.enabled, query.from, query.to])
  const configuration = useAdsEntities(status?.profileId ?? null, connected, refresh)
  const supplemental = useSupplementalAds({ enabled: connected, profileId: status?.profileId ?? null, from: query.from, to: query.to, refresh })
  useEffect(() => {
    let current = true
    setGroupKey(null); setGroupError(null)
    const profile = connected ? status?.profileId : props.report?.id
    if (!profile) return
    void advertisingGroupsKey(profile, connected ? status?.sellerId ?? 'selected-seller' : props.financialIdentity ?? 'uploaded-workspace').then(async key => {
      const entry = await readAdvertisingGroups(key)
      if (current) { setGroupKey(key); setGroupState({ key, entry }) }
    }).catch(cause => { if (current) setGroupError(cause instanceof Error ? cause.message : 'Saved groups unavailable.') })
    return () => { current = false }
  }, [connected, status?.profileId, status?.sellerId, props.report?.id, props.financialIdentity])
  const groups = groupKey && groupState?.key === groupKey ? groupState.entry.value.groups : []
  const resolvedProducts = useMemo(() => resolveAdvertisingSkus(props.report?.rows.map(row => row.advertisedSku) ?? [], props.events.flatMap(event => event.sku ? [event.sku] : []), props.normalizeSku), [props.report, props.events, props.normalizeSku])
  const source = useMemo(() => props.report ? sponsoredWorkspaceSource(props.report, resolvedProducts) : null, [props.report, resolvedProducts])
  const supplementalSources = useMemo(() => ({ ...supplemental?.sources,
    purchasedProduct: supplemental?.sources.purchasedProduct ? resolveWorkspaceProducts(supplemental.sources.purchasedProduct, resolvedProducts) : null,
  }), [supplemental?.sources, resolvedProducts])
  const financial = useMemo(() => advertisingFinancialContext({ events: props.events, costs: props.costs, policy: props.policy, normalizeSku: props.normalizeSku, from: query.from, to: query.to,
    coverage: props.financialCoverage, uploadedFrom: props.financialFrom, uploadedTo: props.financialTo, compatible: props.financialCompatible }), [props.events, props.costs, props.policy, props.normalizeSku, props.financialCoverage, props.financialFrom, props.financialTo, props.financialCompatible, query.from, query.to])
  const previousFinancial = useMemo(() => advertisingFinancialContext({ events: props.events, costs: props.costs, policy: props.policy, normalizeSku: props.normalizeSku, ...previousEqualRange(query), coverage: props.financialCoverage,
    uploadedFrom: props.financialFrom, uploadedTo: props.financialTo, compatible: props.financialCompatible }), [props.events, props.costs, props.policy, props.normalizeSku, props.financialCoverage, props.financialFrom, props.financialTo, props.financialCompatible, query])
  const model = useMemo(() => {
    const value = buildAdvertisingWorkspaceModel({ source, query, detailContext, advertiser: status?.accountName ?? 'Selected report', asOf: new Date().toISOString(), financial, previousFinancial, productNames: props.productNames, groups, selectedEntity: entity,
      supplemental: supplementalSources, refreshing: status?.state === 'syncing' || supplemental?.busy === true, error: queryError ?? groupError ?? props.connection.error ?? status?.error ?? null })
    return { ...value, canRefresh: Boolean(props.connection.enabled && props.connection.supported && status?.configured), refreshUnavailableReason: 'Connect advertising reports in Settings to refresh. Uploaded workbooks are replaced through Reports.', notices: [...value.notices, ...(supplemental?.errors ?? []), ...(!connected && props.report ? ['Workbook mode: supplemental API sources are not combined with this uploaded report.'] : []), 'Financial context uses the selected financial report by posting date. Product contribution excludes ad GST and unassigned account expenses.'] }
  }, [source, query, detailContext, status, financial, previousFinancial, props.productNames, groups, entity, supplemental, supplementalSources, queryError, groupError, props.connection.error, connected])
  const reviewedModel = useMemo(() => enrichWorkspaceModel(model, source, supplementalSources, configuration?.snapshot, new Date().toISOString(), detailContext), [model, source, supplementalSources, configuration, detailContext])
  const visibleAsins = [...reviewedModel.products, ...reviewedModel.searchTerms, ...(reviewedModel.detail?.products ?? []), ...(reviewedModel.detail?.searchTerms ?? [])].flatMap(item => item.imageAsin ? [item.imageAsin] : [])
  if (reviewedModel.detail?.imageAsin) visibleAsins.push(reviewedModel.detail.imageAsin)
  for (const item of reviewedModel.detail?.crossSales ?? []) { if (item.advertisedAsin) visibleAsins.push(item.advertisedAsin); if (item.purchasedAsin) visibleAsins.push(item.purchasedAsin) }
  for (const item of reviewedModel.detail?.targets ?? []) if (item.imageAsin) visibleAsins.push(item.imageAsin)
  const catalog = useAdsCatalog(status?.profileId ?? null, connected, visibleAsins.slice(0, 60))
  const image = (sku: string, asin?: string | null) => props.productImages?.get(sku) ?? (asin ? catalog[asin]?.imageUrl : null) ?? null
  const imageRow = (item: typeof reviewedModel.products[number]) => ({ ...item, imageUrl: image(item.entity.id, item.imageAsin) })
  const displayModel = { ...reviewedModel, products: reviewedModel.products.map(imageRow), searchTerms: reviewedModel.searchTerms.map(imageRow), notices: [...reviewedModel.notices, ...(configuration?.errors ?? []), ...[...new Set(Object.values(catalog).flatMap(item => item.error ? [`Image lookup: ${item.error}`] : []))].slice(0, 2)], detail: reviewedModel.detail ? { ...reviewedModel.detail,
    imageUrl: image(reviewedModel.detail.entity.id, reviewedModel.detail.imageAsin), targets: reviewedModel.detail.targets.map(item => ({ ...item, imageUrl: image('', item.imageAsin) })), products: reviewedModel.detail.products.map(imageRow), searchTerms: reviewedModel.detail.searchTerms.map(imageRow),
    crossSales: reviewedModel.detail.crossSales.map(item => ({ ...item, advertisedImageUrl: image(item.advertisedProduct, item.advertisedAsin), purchasedImageUrl: image(item.purchasedProduct ?? '', item.purchasedAsin) })),
  } : null }
  function changeQuery(patch: Partial<AdvertisingViewQuery>) {
    const next = { ...query, ...patch }
    if (!validAdsDate(next.from) || !validAdsDate(next.to) || next.from > next.to) { setQueryError('Choose valid start/end dates, with the end on or after the start.'); return }
    if (next.targetAcos !== undefined && (!Number.isFinite(next.targetAcos) || next.targetAcos <= 0 || next.targetAcos > 100)) { setQueryError('Target ACOS must be above 0 and at most 100%.'); return }
    setQueryError(null); setQuery(next); setDetailContext(null)
    if (patch.scope || patch.campaignId !== undefined) setEntity(null)
  }
  function openEntity(next: AdvertisingEntity) {
    if (entity) {
      const context: AdvertisingQuery = detailContext ?? { from: query.from, to: query.to, scope: query.scope, campaignId: query.campaignId }
      const group = entity.kind === 'GROUP' ? groups.find(item => item.id === entity.id) : null
      setDetailContext(entity.kind === 'PRODUCT' ? { ...context, scope: { kind: 'PRODUCT', productId: entity.id } }
        : group ? { ...context, scope: { kind: 'GROUP', groupId: group.id, version: group.version, productIds: group.productIds } }
        : entity.kind === 'CAMPAIGN' ? { ...context, campaignId: entity.id } : context)
    } else setDetailContext(null)
    setEntity(next)
  }
  const saveGroup: AdvertisingWorkspaceViewProps['onSaveGroup'] = async draft => {
    if (!groupKey || !groupState || groupState.key !== groupKey) throw new Error('Wait for saved groups to load before saving.')
    const entry = await saveAdvertisingGroup(groupKey, groupState.entry, draft)
    setGroupState({ key: groupKey, entry }); setDetailContext(null)
    const group = entry.value.groups.find(item => draft.id ? item.id === draft.id : !groupState.entry.value.groups.some(old => old.id === item.id))
    if (group) { setQuery(current => ({ ...current, scope: { kind: 'GROUP', groupId: group.id, version: group.version, productIds: group.productIds }, page: 1 })); setEntity({ kind: 'GROUP', id: group.id }) }
  }
  return <AdvertisingWorkspaceView model={displayModel} formatMoney={props.formatMoney} onQueryChange={changeQuery} onOpenEntity={openEntity} onCloseDetail={() => { setEntity(null); setDetailContext(null) }} onOpenSettings={props.onOpenSettings} onOpenFinancialProduct={props.onOpenFinancialProduct} onSaveGroup={saveGroup}
    onRefresh={() => { void props.connection.refresh({ from: query.from, to: query.to }); setRefresh(value => value + 1) }} />
}
