import { listAccountCharges } from '../analytics/accountCharges'
import type { CanonicalFinancialEvent } from '../data/types'
import type { SkuProfitSummary } from '../analytics/orderProfit'
import type { SponsoredProductRow, SponsoredProductsReport } from './types'

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)
const ratio = (numerator: number, denominator: number, multiplier = 1) => denominator > 0 ? numerator / denominator * multiplier : null

export interface SponsoredPerformance {
  readonly spend: number
  readonly attributedSales: number
  readonly sameSkuSales: number
  readonly otherSkuSales: number
  readonly impressions: number
  readonly clicks: number
  readonly orders: number
  readonly units: number
  readonly acos: number | null
  readonly roas: number | null
  readonly cpc: number | null
  readonly ctr: number | null
  readonly conversionRate: number | null
  readonly costPerAttributedOrder: number | null
}
export interface SponsoredSkuAttribution extends SponsoredPerformance {
  readonly sku: string
  readonly asin: string
  readonly grossSales: number
  readonly tacos: number | null
  readonly campaigns: readonly (SponsoredPerformance & { campaign: string; adGroup: string })[]
  readonly daily: readonly (SponsoredPerformance & { date: string })[]
}
export interface SponsoredProductsAttribution {
  readonly status: 'AVAILABLE' | 'NO_REPORT' | 'OUTSIDE_COVERAGE' | 'UNSUPPORTED_FILTER'
  readonly selectedFrom: string
  readonly selectedTo: string
  readonly reportFrom?: string
  readonly reportTo?: string
  readonly unifiedAdsCost: number
  readonly reportSpendExcludingTax: number
  readonly matchedSpend: number
  readonly unmatchedSpend: number
  readonly reconciliationDifference: number
  readonly performance: SponsoredPerformance
  readonly accountCharges: readonly { label: string; amount: number; classified: boolean }[]
  readonly unmatched: readonly { sku: string; spend: number; reason: string }[]
  readonly skus: readonly SponsoredSkuAttribution[]
}

export function intersectAdvertisingRange(report: SponsoredProductsReport | null, financialRange: Readonly<{ from: string; to: string }>) {
  if (!report || !financialRange.from || !financialRange.to || financialRange.from > financialRange.to) return null
  const from = report.minDate > financialRange.from ? report.minDate : financialRange.from
  const to = report.maxDate < financialRange.to ? report.maxDate : financialRange.to
  return from <= to ? { from, to } : null
}

export function summarizeSponsoredPerformance(rows: readonly SponsoredProductRow[]): SponsoredPerformance {
  const spend = round(sum(rows.map(row => row.spendExcludingTax)))
  const attributedSales = round(sum(rows.map(row => row.attributedSales)))
  const impressions = sum(rows.map(row => row.impressions)), clicks = sum(rows.map(row => row.clicks))
  const orders = sum(rows.map(row => row.orders)), units = sum(rows.map(row => row.units))
  return { spend, attributedSales, sameSkuSales: round(sum(rows.map(row => row.advertisedSkuSales))), otherSkuSales: round(sum(rows.map(row => row.otherSkuSales))),
    impressions, clicks, orders, units, acos: ratio(spend, attributedSales, 100), roas: ratio(attributedSales, spend), cpc: ratio(spend, clicks),
    ctr: ratio(clicks, impressions, 100), conversionRate: ratio(orders, clicks, 100), costPerAttributedOrder: ratio(spend, orders) }
}

export function buildSponsoredProductsAttribution(
  events: readonly CanonicalFinancialEvent[], report: SponsoredProductsReport | null,
  range: Readonly<{ from: string; to: string }>,
  options: Readonly<{ identityEvents?: readonly CanonicalFinancialEvent[]; normalizeSku?: (sku: string) => string; unsupportedFilter?: boolean }> = {},
): SponsoredProductsAttribution {
  const unifiedAdsCost = round(-sum(events.filter(event => event.amountClass === 'OPERATING' && event.amountType === 'ADVERTISING_FEE').map(event => event.amount)))
  const accountCharges = listAccountCharges(events)
  const unavailable = (status: SponsoredProductsAttribution['status']): SponsoredProductsAttribution => ({
    status, selectedFrom: range.from, selectedTo: range.to, reportFrom: report?.minDate, reportTo: report?.maxDate, unifiedAdsCost,
    reportSpendExcludingTax: 0,
    matchedSpend: 0, unmatchedSpend: 0, reconciliationDifference: unifiedAdsCost,
    accountCharges, performance: summarizeSponsoredPerformance([]), unmatched: [], skus: [],
  })
  if (!report) return unavailable('NO_REPORT')
  if (options.unsupportedFilter) return unavailable('UNSUPPORTED_FILTER')
  if (!range.from || !range.to || range.from > range.to || report.minDate > range.from || report.maxDate < range.to) return unavailable('OUTSIDE_COVERAGE')
  const key = (sku: string) => (options.normalizeSku?.(sku) ?? sku).trim()
  const identities = new Map<string, Set<string>>()
  for (const event of options.identityEvents ?? events) {
    if (!event.sku) continue
    const identity = key(event.sku)
    const candidates = identities.get(identity) ?? new Set<string>()
    candidates.add(event.sku); identities.set(identity, candidates)
  }
  const rows = report.rows.filter(row => row.date >= range.from && row.date <= range.to)
  const performance = summarizeSponsoredPerformance(rows)

  const salesBySku = new Map<string,number>()
  for (const event of events) if (event.sku && event.event === 'SALE' && event.amountType === 'PRODUCT_REVENUE' && event.amount > 0) salesBySku.set(event.sku,(salesBySku.get(event.sku) ?? 0) + event.amount)
  const append = (map:Map<string,SponsoredProductRow[]>, key:string, row:SponsoredProductRow) => {
    const group = map.get(key)
    if (group) group.push(row); else map.set(key,[row])
  }
  const grouped = new Map<string, SponsoredProductRow[]>()
  for (const row of rows) append(grouped,row.advertisedSku,row)
  const matched = new Map<string, SponsoredProductRow[]>()
  const unmatched: { sku: string; spend: number; reason: string }[] = []
  for (const [advertisedSku, skuRows] of grouped) {
    const candidates = identities.get(key(advertisedSku))
    // Exact identity wins; normalized aliases are accepted only when unambiguous.
    const sku = candidates?.has(advertisedSku) ? advertisedSku : candidates?.size === 1 ? [...candidates][0] : undefined
    if (!sku) { unmatched.push({ sku: advertisedSku, spend: summarizeSponsoredPerformance(skuRows).spend, reason: candidates?.size ? 'Ambiguous SKU identity' : 'No financial SKU match' }); continue }
    for (const row of skuRows) append(matched,sku,row)
  }
  const skus: SponsoredSkuAttribution[] = [...matched].map(([sku, skuRows]) => {
    const values = summarizeSponsoredPerformance(skuRows)
    const grossSales = round(salesBySku.get(sku) ?? 0)

    const groups = new Map<string, SponsoredProductRow[]>(), days = new Map<string, SponsoredProductRow[]>()
    for (const row of skuRows) {
      const group = JSON.stringify([row.campaign, row.adGroup])
      append(groups,group,row); append(days,row.date,row)
    }
    return { ...values, sku, asin: [...new Set(skuRows.map(row => row.advertisedAsin).filter(Boolean))].join(', '), grossSales,
      tacos: ratio(values.spend, grossSales, 100),
      campaigns: [...groups.values()].map(items => ({ ...summarizeSponsoredPerformance(items), campaign: items[0].campaign, adGroup: items[0].adGroup })),
      daily: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => ({ ...summarizeSponsoredPerformance(items), date })) }
  }).sort((a, b) => b.spend - a.spend || a.sku.localeCompare(b.sku))
  const matchedSpend = round(sum(skus.map(sku => sku.spend)))
  return { status: 'AVAILABLE', selectedFrom: range.from, selectedTo: range.to, reportFrom: report.minDate, reportTo: report.maxDate, unifiedAdsCost,
    reportSpendExcludingTax: performance.spend,
    matchedSpend, unmatchedSpend: round(performance.spend - matchedSpend),
    reconciliationDifference: round(unifiedAdsCost - performance.spend),
    accountCharges, performance, unmatched, skus }
}

export function buildSkuAdvertisingEconomics(product: SkuProfitSummary, ads: SponsoredSkuAttribution) {
  // Restore any booked SKU ads before deducting reported spend, so ads are deducted once.
  const completeCosts = product.profitReady && !product.missingCost
  const contributionBeforeReportedAds = completeCosts ? round(product.profit + product.advertising) : null
  const contributionAfterReportedAds = contributionBeforeReportedAds === null ? null : round(contributionBeforeReportedAds - ads.spend)

  return { contributionBeforeReportedAds, contributionAfterReportedAds, bookedSkuAdvertisingRestored: product.advertising,
    contributionMargin: contributionAfterReportedAds === null ? null : ratio(contributionAfterReportedAds, product.grossSales, 100),
    costPerSoldUnit: ratio(ads.spend, product.soldQuantity), costPerRetainedUnit: ratio(ads.spend, product.netDeliveredQuantity),
    breakEvenTacos: contributionBeforeReportedAds === null ? null : ratio(Math.max(0, contributionBeforeReportedAds), product.grossSales, 100),
    bridge: [
      { label: 'Net product revenue after refunds', amount: product.netProductRevenue },
      { label: 'Marketplace charges', amount: -product.marketplaceCharges },
      { label: 'Shipping net of reversals', amount: -product.shippingFees },
      { label: 'Source tax components (existing policy)', amount: product.tax },
      { label: 'Reimbursements', amount: product.reimbursements },
      { label: 'Other adjustments including promotions and shipping revenue', amount: product.otherOperating },
      { label: 'Booked SKU advertising (Unified)', amount: -product.advertising },
      { label: 'Restore booked SKU advertising to avoid double deduction', amount: product.advertising },
      { label: 'Net COGS', amount: completeCosts ? -product.netCogs : null },
      { label: 'Product contribution before reported ads', amount: contributionBeforeReportedAds },
      { label: 'Reported product ads before GST', amount: -ads.spend },
      { label: 'Product contribution after reported ads', amount: contributionAfterReportedAds },
    ] }
}
