import type { CanonicalFinancialEvent } from '../data/types'
import { canonicalDateKey } from './dashboardSummary'
import type { SkuProfitSummary } from './orderProfit'

const rounded = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)
const adSpend = (events: readonly CanonicalFinancialEvent[]) => rounded(-sum(events.filter((event) => event.amountClass === 'OPERATING' && event.amountType === 'ADVERTISING_FEE').map((event) => event.amount)))
const grossSales = (events: readonly CanonicalFinancialEvent[]) => rounded(sum(events.filter((event) => event.event === 'SALE' && event.amountType === 'PRODUCT_REVENUE' && event.amount > 0).map((event) => event.amount)))

export interface AdvertisingTrendPoint { readonly date: string; readonly grossSales: number; readonly adsSpend: number; readonly tacos: number; readonly roas: number }
export interface SkuAdvertisingSummary { readonly sku: string; readonly grossSales: number; readonly directAdsSpend: number; readonly tacos: number; readonly roas: number; readonly attribution: 'DIRECT' | 'UNATTRIBUTED' }
export interface AdvertisingSummary { readonly grossSales: number; readonly adsSpend: number; readonly tacos: number; readonly roas: number; readonly directAdsSpend: number; readonly unassignedAdsSpend: number; readonly attributionCoverage: number; readonly adEventCount: number; readonly trend: readonly AdvertisingTrendPoint[]; readonly skus: readonly SkuAdvertisingSummary[] }
export interface AdvertisingSkuFilterSpec { readonly search?: string; readonly sort?: 'ADS_SPEND' | 'TACOS' | 'ROAS' | 'GROSS_SALES'; readonly direction?: 'ASC' | 'DESC' }
export interface AdvertisingDimensionFilters { readonly accountType?: string; readonly fulfillmentType?: string }
export interface AdvertisingSkuInsight { readonly sku: string; readonly hasDirectAttribution: boolean; readonly directAdsSpend: number; readonly tacos: number | null; readonly roas: number | null; readonly bookedProfit: number; readonly profitBeforeAds: number; readonly profitAfterDirectAds: number | null; readonly marginAfterDirectAds: number | null; readonly breakEvenTacos: number; readonly maximumAffordableAds: number }

export function buildAdvertisingSkuInsight(advertising: SkuAdvertisingSummary, profitability: SkuProfitSummary): AdvertisingSkuInsight {
  const profitBeforeAds = rounded(profitability.profit + profitability.advertising)
  const hasDirectAttribution = advertising.attribution === 'DIRECT'
  const profitAfterDirectAds = hasDirectAttribution ? rounded(profitBeforeAds - advertising.directAdsSpend) : null
  return { sku: advertising.sku, hasDirectAttribution, directAdsSpend: advertising.directAdsSpend, tacos: hasDirectAttribution ? advertising.tacos : null, roas: hasDirectAttribution ? advertising.roas : null, bookedProfit: profitability.profit, profitBeforeAds, profitAfterDirectAds, marginAfterDirectAds: profitAfterDirectAds !== null && profitability.grossSales ? profitAfterDirectAds / profitability.grossSales * 100 : null, breakEvenTacos: profitability.grossSales ? Math.max(0, profitBeforeAds / profitability.grossSales * 100) : 0, maximumAffordableAds: Math.max(0, profitBeforeAds) }
}

export function filterAdvertisingScope(events: readonly CanonicalFinancialEvent[], filters: AdvertisingDimensionFilters): CanonicalFinancialEvent[] {
  return events.filter((event) => {
    if (filters.accountType && event.accountType !== filters.accountType) return false
    if (filters.fulfillmentType && event.fulfillmentType && event.fulfillmentType !== filters.fulfillmentType) return false
    return true
  })
}

export function filterAdvertisingSkus(items: readonly SkuAdvertisingSummary[], spec: AdvertisingSkuFilterSpec): SkuAdvertisingSummary[] {
  const query = spec.search?.trim().toLocaleLowerCase() ?? ''
  const direction = spec.direction === 'ASC' ? 1 : -1
  const value = (item: SkuAdvertisingSummary) => spec.sort === 'TACOS' ? item.tacos : spec.sort === 'ROAS' ? item.roas : spec.sort === 'GROSS_SALES' ? item.grossSales : item.directAdsSpend
  return items.filter((item) => !query || item.sku.toLocaleLowerCase().includes(query)).sort((left, right) => (value(left) - value(right)) * direction || left.sku.localeCompare(right.sku))
}

export function summarizeAdvertising(events: readonly CanonicalFinancialEvent[]): AdvertisingSummary {
  const advertisingEvents = events.filter((event) => event.amountClass === 'OPERATING' && event.amountType === 'ADVERTISING_FEE')
  const totalAdsSpend = adSpend(advertisingEvents)
  const sales = grossSales(events)
  const directAdsSpend = adSpend(advertisingEvents.filter((event) => event.sku))
  const unassignedAdsSpend = rounded(totalAdsSpend - directAdsSpend)

  const byDate = new Map<string, CanonicalFinancialEvent[]>()
  events.forEach((event) => { const date = canonicalDateKey(event.date); if (date) byDate.set(date, [...(byDate.get(date) ?? []), event]) })
  const trend = [...byDate].sort(([left], [right]) => left.localeCompare(right)).map(([date, items]) => {
    const dailyGrossSales = grossSales(items), dailyAdsSpend = adSpend(items)
    return { date, grossSales: dailyGrossSales, adsSpend: dailyAdsSpend, tacos: dailyGrossSales ? dailyAdsSpend / dailyGrossSales * 100 : 0, roas: dailyAdsSpend ? dailyGrossSales / dailyAdsSpend : 0 }
  })

  const skuNames = [...new Set(events.flatMap((event) => event.sku && ((event.event === 'SALE' && event.amountType === 'PRODUCT_REVENUE' && event.amount > 0) || event.amountType === 'ADVERTISING_FEE') ? [event.sku] : []))].sort()
  const skuInputs = skuNames.map((sku) => ({ sku, grossSales: grossSales(events.filter((event) => event.sku === sku)), directAdsSpend: adSpend(advertisingEvents.filter((event) => event.sku === sku)) }))
  const skus = skuInputs.map((item): SkuAdvertisingSummary => {
    return { ...item, tacos: item.grossSales && item.directAdsSpend ? item.directAdsSpend / item.grossSales * 100 : 0, roas: item.directAdsSpend ? item.grossSales / item.directAdsSpend : 0, attribution: item.directAdsSpend ? 'DIRECT' : 'UNATTRIBUTED' }
  }).sort((left, right) => right.directAdsSpend - left.directAdsSpend)

  return { grossSales: sales, adsSpend: totalAdsSpend, tacos: sales ? totalAdsSpend / sales * 100 : 0, roas: totalAdsSpend ? sales / totalAdsSpend : 0, directAdsSpend, unassignedAdsSpend, attributionCoverage: totalAdsSpend ? Math.min(100, Math.abs(directAdsSpend / totalAdsSpend) * 100) : 100, adEventCount: advertisingEvents.length, trend, skus }
}
