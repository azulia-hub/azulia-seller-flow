/** Codex owns this integration contract. UI-only work imports these types. */
import type { AdvertisingGroup, AdvertisingMetrics, AdvertisingScope } from '../../core/advertising/workspace'
import type { AdvertisingRecommendation } from '../../core/advertising/recommendations'
export type { AdvertisingGroup, AdvertisingMetrics, AdvertisingScope }
export type AdvertisingViewId = 'overview' | 'campaigns' | 'products' | 'searchTerms'
export type AdvertisingEntity =
  | { readonly kind: 'CAMPAIGN'; readonly id: string }
  | { readonly kind: 'PRODUCT'; readonly id: string }
  | { readonly kind: 'GROUP'; readonly id: string }
  | { readonly kind: 'SEARCH_TERM'; readonly id: string }
export interface AdvertisingViewQuery {
  readonly targetAcos?: number
  readonly view: AdvertisingViewId
  readonly from: string
  readonly to: string
  readonly scope: AdvertisingScope
  readonly campaignId?: string
  readonly search: string
  readonly sort: 'SPEND' | 'SALES' | 'ACOS' | 'ROAS' | 'PURCHASES'
  readonly direction: 'ASC' | 'DESC'
  readonly sortSelected?: boolean
  readonly page: number
}
export type AdvertisingSortQuery = Pick<AdvertisingViewQuery, 'sort' | 'direction' | 'sortSelected'>
export interface AdvertisingChange {
  readonly value: number
  readonly unit: 'PERCENT' | 'PERCENTAGE_POINTS' | 'ABSOLUTE'
  readonly favorable: boolean | null
}
export interface AdvertisingSummaryMetric {
  readonly id: 'spend' | 'attributedSales' | 'acos' | 'roas' | 'tacos'
  readonly label: string
  readonly value: number | null
  readonly format: 'MONEY' | 'PERCENT' | 'MULTIPLIER'
  readonly definition: string
  readonly unavailableReason?: string
  readonly change: AdvertisingChange | null
}
export interface AdvertisingNegativeMatch {
  readonly value: string
  readonly type: 'Exact keyword' | 'Phrase keyword' | 'ASIN'
  readonly scope: 'Campaign' | 'Ad group'
  readonly observedAt: string
}
export interface AdvertisingEntityRow {
  readonly negativeMatches?: readonly AdvertisingNegativeMatch[]
  readonly imageUrl?: string | null
  readonly imageAsin?: string | null
  readonly recommendation?: AdvertisingRecommendation
  readonly entity: AdvertisingEntity
  readonly name: string
  readonly subtitle?: string
  readonly metrics: AdvertisingMetrics
  readonly change: AdvertisingChange | null
  readonly status: string | null
  readonly note?: string
  readonly relatedCampaigns?: number
  readonly target?: string | null
  readonly matchType?: string | null
  readonly attributionScope?: 'DIRECT' | 'SHARED_AD_GROUP' | 'UNAVAILABLE'
}
export interface AdvertisingFinding {
  readonly id: string
  readonly title: string
  readonly explanation: string
  readonly entity: AdvertisingEntity
  readonly evidence: readonly string[]
  readonly severity: 'REVIEW' | 'DATA_QUALITY'
}
export interface AdvertisingTrendPoint { readonly date: string; readonly metrics: AdvertisingMetrics }
export interface AdvertisingTargetRow {
  readonly effectiveStatus?: string | null
  readonly imageUrl?: string | null
  readonly recommendation?: AdvertisingRecommendation
  readonly imageAsin?: string | null
  readonly id: string
  readonly name: string
  readonly matchType: string | null
  readonly status: string | null
  readonly configuredBid: number | null
  readonly bidSource: 'TARGET' | 'AD_GROUP_DEFAULT' | 'UNKNOWN'
  readonly observedAt: string | null
  readonly metrics: AdvertisingMetrics | null
}
export interface AdvertisingCrossSale {
  readonly advertisedImageUrl?: string | null
  readonly purchasedImageUrl?: string | null
  readonly advertisedAsin?: string | null
  readonly purchasedAsin?: string | null
  readonly id: string
  readonly advertisedProduct: string
  readonly purchasedProduct: string | null
  readonly relationship: 'SAME_PRODUCT' | 'SIBLING' | 'OUTSIDE_GROUP' | 'UNKNOWN'
  readonly attributedSales: number | null
  readonly units: number | null
  readonly evidence: string
}
export interface AdvertisingDetailModel {
  readonly imageUrl?: string | null
  readonly imageAsin?: string | null
  readonly entity: AdvertisingEntity
  readonly title: string
  readonly subtitle: string
  readonly summary: readonly AdvertisingSummaryMetric[]
  readonly metrics: AdvertisingMetrics
  readonly campaigns: readonly AdvertisingEntityRow[]
  readonly products: readonly AdvertisingEntityRow[]
  readonly searchTerms: readonly AdvertisingEntityRow[]
  readonly targets: readonly AdvertisingTargetRow[]
  readonly crossSales: readonly AdvertisingCrossSale[]
  readonly trend: readonly AdvertisingTrendPoint[]
  readonly notices: readonly string[]
  readonly availableSections: readonly ('summary' | 'campaigns' | 'products' | 'searchTerms' | 'targets' | 'crossSales')[]
}
export interface AdvertisingWorkspaceModel {
  readonly canRefresh?: boolean
  readonly refreshUnavailableReason?: string
  readonly advertiser: string
  readonly marketplace: string
  readonly currency: string
  readonly timezone: string
  readonly adProductLabel: string
  readonly query: AdvertisingViewQuery
  readonly availableViews: readonly { id: AdvertisingViewId; label: string }[]
  readonly sourceState: 'LOADING' | 'READY' | 'PARTIAL' | 'EMPTY' | 'ERROR'
  readonly error: string | null
  readonly refreshing: boolean
  readonly lastUpdated: string | null
  readonly coveredFrom: string | null
  readonly coveredTo: string | null
  readonly basisLabel: string
  readonly comparisonLabel: string | null
  readonly notices: readonly string[]
  readonly summary: readonly AdvertisingSummaryMetric[]
  readonly findings: readonly AdvertisingFinding[]
  readonly trend: readonly AdvertisingTrendPoint[]
  readonly campaigns: readonly AdvertisingEntityRow[]
  readonly products: readonly AdvertisingEntityRow[]
  readonly searchTerms: readonly AdvertisingEntityRow[]
  readonly groups: readonly AdvertisingGroup[]
  readonly productChoices: readonly { id: string; name: string }[]
  readonly totalRows: number
  readonly pageSize: number
  readonly detail: AdvertisingDetailModel | null
}
export interface AdvertisingWorkspaceViewProps {
  readonly model: AdvertisingWorkspaceModel
  readonly formatMoney: (value: number) => string
  readonly onQueryChange: (patch: Partial<AdvertisingViewQuery>) => void
  readonly onOpenEntity: (entity: AdvertisingEntity) => void
  readonly onCloseDetail: () => void
  readonly onRefresh: () => void
  readonly onOpenSettings: () => void
  readonly onOpenFinancialProduct: (productId: string) => void
  readonly onSaveGroup: (input: { id?: string; name: string; productIds: readonly string[] }) => Promise<void>
}
