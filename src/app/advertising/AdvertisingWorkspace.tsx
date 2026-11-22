import { getIndiaToday } from '../../core/sync/planner'
import { useAdsEntities } from './useAdsEntities'
import { useAdvertisingCalculation } from './useAdvertisingCalculation'
import type { AdvertisingCalculationInput } from './calculateWorkspace'
import { useAdsCatalog } from './useAdsCatalog'
import { VisibleAdsAsins } from '../../features/advertising-workspace/ui/VisibleAsins'
import { useEffect, useMemo, useState } from 'react'
import { AdvertisingWorkspaceView } from '../../features/advertising-workspace/ui/AdvertisingWorkspaceView'
import type { AdvertisingGroup, AdvertisingEntity, AdvertisingViewQuery, AdvertisingWorkspaceViewProps } from '../../features/advertising-workspace/contract'
import type { CanonicalFinancialEvent } from '../../core/data/types'
import type { ProductCost } from '../../core/costs/types'
import type { MissingCostPolicy } from '../../core/costs/calculateCosts'
import type { SponsoredProductsReport } from '../../core/advertising/types'
import type { SyncRange } from '../../core/sync/ranges'
import { resolveAdvertisingSkus, resolveWorkspaceProducts, sponsoredWorkspaceSource } from '../../adapters/amazon-ads/workspaceSource'
import { advertisingGroupsKey, readAdvertisingGroups, saveAdvertisingGroup, type AdvertisingGroupEntry } from '../../adapters/amazon-ads/groups'
import { validAdsDate, shiftAdsDate } from '../../adapters/amazon-ads/report'
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

const emptyGroups: readonly AdvertisingGroup[] = []

/** React owns interaction/lifecycle only; selectors own financial and Ads calculations. */
export function AdvertisingWorkspace(props: AdvertisingWorkspaceProps) {
  const today = getIndiaToday()
  const [query, setQuery] = useState<AdvertisingViewQuery>(() => ({ view: 'overview', from: validAdsDate(props.from) ? props.from : props.report?.minDate ?? shiftAdsDate(today, -29), to: validAdsDate(props.to) ? props.to : props.report?.maxDate ?? today,
    scope: props.initialProduct ? { kind: 'PRODUCT', productId: props.initialProduct } : { kind: 'ACCOUNT' }, search: '', sort: 'SPEND', direction: 'DESC', page: 1 }))
  const [entity, setEntity] = useState<AdvertisingEntity | null>(props.initialProduct ? { kind: 'PRODUCT', id: props.initialProduct } : null)
  const [detailContext, setDetailContext] = useState<AdvertisingQuery | null>(null)
  const [detailAsins, setDetailAsins] = useState<readonly string[]>([])
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
  const groups = groupKey && groupState?.key === groupKey ? groupState.entry.value.groups : emptyGroups
  const resolvedProducts = useMemo(() => resolveAdvertisingSkus(props.report?.rows.map(row => row.advertisedSku) ?? [], props.events.flatMap(event => event.sku ? [event.sku] : []), props.normalizeSku), [props.report, props.events, props.normalizeSku])
  const source = useMemo(() => props.report ? sponsoredWorkspaceSource(props.report, resolvedProducts) : null, [props.report, resolvedProducts])
  const supplementalSources = useMemo(() => ({ ...supplemental?.sources,
    purchasedProduct: supplemental?.sources.purchasedProduct ? resolveWorkspaceProducts(supplemental.sources.purchasedProduct, resolvedProducts) : null,
  }), [supplemental?.sources, resolvedProducts])
  const skuAliases = useMemo(() => props.normalizeSku ? [...new Set([...props.events.flatMap(event => event.sku ? [event.sku] : []), ...props.costs.map(cost => cost.sku)])].map(sku => [sku, props.normalizeSku!(sku)] as const) : undefined, [props.events, props.costs, props.normalizeSku])
  const financialInput = useMemo(() => ({ events: props.events, costs: props.costs, policy: props.policy,
    coverage: props.financialCoverage, uploadedFrom: props.financialFrom, uploadedTo: props.financialTo, compatible: props.financialCompatible,
  }), [props.events, props.costs, props.policy, props.financialCoverage, props.financialFrom, props.financialTo, props.financialCompatible])
  const calculationInput = useMemo<AdvertisingCalculationInput>(() => ({ source, query, detailContext, advertiser: status?.accountName ?? 'Selected report', asOf: new Date().toISOString(),
    financialInput, skuAliases, productNames: props.productNames, groups, selectedEntity: entity, supplemental: supplementalSources, entities: configuration?.snapshot, refreshing: false, error: null,
  }), [source, query, detailContext, status?.accountName, financialInput, skuAliases, props.productNames, groups, entity, supplementalSources, configuration?.snapshot])
  const calculation = useAdvertisingCalculation(calculationInput)
  const reviewedModel = calculation.model
  const visibleAsins = [...detailAsins, ...[...(query.view === 'products' ? reviewedModel?.products ?? [] : []), ...(query.view === 'searchTerms' ? reviewedModel?.searchTerms ?? [] : [])].flatMap(item => item.imageAsin ? [item.imageAsin] : [])]
  if (reviewedModel?.detail?.imageAsin) visibleAsins.push(reviewedModel.detail.imageAsin)
  const catalog = useAdsCatalog(status?.profileId ?? null, connected, visibleAsins.slice(0, 60))
  const image = (sku: string, asin?: string | null) => props.productImages?.get(sku) ?? (asin ? catalog[asin]?.imageUrl : null) ?? null
  const imageRow = (item: NonNullable<typeof reviewedModel>['products'][number]) => ({ ...item, imageUrl: image(item.entity.id, item.imageAsin) })
  const displayModel = reviewedModel ? { ...reviewedModel, products: reviewedModel.products.map(imageRow), searchTerms: reviewedModel.searchTerms.map(imageRow), canRefresh: Boolean(props.connection.enabled && props.connection.supported && status?.configured), refreshing: calculation.pending || status?.state === 'syncing', error: calculation.error ?? queryError ?? groupError ?? props.connection.error ?? status?.error ?? null, notices: [...reviewedModel.notices, ...(supplemental?.errors ?? []), ...(configuration?.errors ?? []), ...(!connected && props.report ? ['Workbook mode: supplemental API sources are not combined with this uploaded report.'] : []), 'Financial context uses the selected financial report by posting date. Product contribution excludes ad GST and unassigned account expenses.', ...[...new Set(Object.values(catalog).flatMap(item => item.error ? [`Image lookup: ${item.error}`] : []))].slice(0, 2)], detail: reviewedModel.detail ? { ...reviewedModel.detail,
    imageUrl: image(reviewedModel.detail.entity.id, reviewedModel.detail.imageAsin), targets: reviewedModel.detail.targets.map(item => ({ ...item, imageUrl: image('', item.imageAsin) })), products: reviewedModel.detail.products.map(imageRow), searchTerms: reviewedModel.detail.searchTerms.map(imageRow),
    crossSales: reviewedModel.detail.crossSales.map(item => ({ ...item, advertisedImageUrl: image(item.advertisedProduct, item.advertisedAsin), purchasedImageUrl: image(item.purchasedProduct ?? '', item.purchasedAsin) })),
  } : null } : null
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
  if (!displayModel) return <section role="status" className="workspace-loading">{calculation.error ?? 'Preparing advertising results…'}</section>
  return <VisibleAdsAsins.Provider value={setDetailAsins}><AdvertisingWorkspaceView model={displayModel} formatMoney={props.formatMoney} onQueryChange={changeQuery} onOpenEntity={openEntity} onCloseDetail={() => { setEntity(null); setDetailContext(null) }} onOpenSettings={props.onOpenSettings} onOpenFinancialProduct={props.onOpenFinancialProduct} onSaveGroup={saveGroup}
    onRefresh={() => { void props.connection.refresh({ from: query.from, to: query.to }); setRefresh(value => value + 1) }} /></VisibleAdsAsins.Provider>
}
