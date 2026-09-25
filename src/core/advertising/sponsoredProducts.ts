import type { CanonicalFinancialEvent } from '../data/types'
import { canonicalDateKey } from '../analytics/dashboardSummary'
import type { SponsoredProductsReport } from './types'

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)
const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/-mfn$/i, '').replace(/[^a-z0-9]/g, '')

export interface SponsoredSkuAttribution {
  readonly sku: string
  readonly asin: string
  readonly grossSales: number
  readonly attributedSales: number
  readonly estimatedOrganicSales: number
  readonly allocatedAdsCost: number
  readonly spendExcludingTax: number
  readonly impressions: number
  readonly clicks: number
  readonly orders: number
  readonly units: number
  readonly tacos: number
  readonly attributedRoas: number
}

export interface SponsoredProductsAttribution {
  readonly status: 'AVAILABLE' | 'NO_REPORT' | 'OUTSIDE_COVERAGE'
  readonly selectedFrom: string
  readonly selectedTo: string
  readonly reportFrom?: string
  readonly reportTo?: string
  readonly gstRate: number
  readonly unifiedAdsCost: number
  readonly reportSpendExcludingTax: number
  readonly reportSpendIncludingTax: number
  readonly allocatedAdsCost: number
  readonly unassignedAdsCost: number
  readonly reconciliationDifference: number
  readonly attributedSales: number
  readonly advertisedSkuSales: number
  readonly otherSkuSales: number
  readonly estimatedOrganicSales: number
  readonly matchedSkuCount: number
  readonly unmatchedSkuCount: number
  readonly skus: readonly SponsoredSkuAttribution[]
}

export function buildSponsoredProductsAttribution(
  events: readonly CanonicalFinancialEvent[],
  report: SponsoredProductsReport | null,
  range: Readonly<{ from: string; to: string }>,
  gstRate = 0.18,
  identityEvents: readonly CanonicalFinancialEvent[] = events,
): SponsoredProductsAttribution {
  const unifiedAdsCost = round(-sum(events.filter(event => event.amountClass === 'OPERATING' && event.amountType === 'ADVERTISING_FEE').map(event => event.amount)))
  const unavailable = (status: 'NO_REPORT' | 'OUTSIDE_COVERAGE'): SponsoredProductsAttribution => ({
    status, selectedFrom: range.from, selectedTo: range.to, reportFrom: report?.minDate, reportTo: report?.maxDate, gstRate,
    unifiedAdsCost, reportSpendExcludingTax: 0, reportSpendIncludingTax: 0, allocatedAdsCost: 0,
    unassignedAdsCost: unifiedAdsCost, reconciliationDifference: unifiedAdsCost, attributedSales: 0,
    advertisedSkuSales: 0, otherSkuSales: 0, estimatedOrganicSales: 0, matchedSkuCount: 0, unmatchedSkuCount: 0, skus: [],
  })
  if (!report) return unavailable('NO_REPORT')
  if (report.minDate > range.from || report.maxDate < range.to) return unavailable('OUTSIDE_COVERAGE')

  const rows = report.rows.filter(row => row.date >= range.from && row.date <= range.to)
  const salesBySku = new Map<string, { sku: string; sales: number }>()
  const identityBySku = new Map<string, string>()
  identityEvents.filter(event => event.sku).forEach(event => identityBySku.set(normalize(event.sku!), event.sku!))
  events.filter(event => event.event === 'SALE' && event.amountType === 'PRODUCT_REVENUE' && event.amount > 0 && event.sku).forEach(event => {
    const key = normalize(event.sku!)
    const current = salesBySku.get(key)
    salesBySku.set(key, { sku: current?.sku ?? event.sku!, sales: round((current?.sales ?? 0) + event.amount) })
  })
  const byAdvertisedSku = new Map<string, typeof rows>()
  rows.forEach(row => {
    const key = normalize(row.advertisedSku)
    byAdvertisedSku.set(key, [...(byAdvertisedSku.get(key) ?? []), row])
  })
  const reportSpendExcludingTax = round(sum(rows.map(row => row.spendExcludingTax)))
  const reportSpendIncludingTax = round(reportSpendExcludingTax * (1 + gstRate))
  const financialScale = reportSpendIncludingTax > unifiedAdsCost && reportSpendIncludingTax > 0 ? unifiedAdsCost / reportSpendIncludingTax : 1
  let unmatchedSkuCount = 0
  const skus: SponsoredSkuAttribution[] = []
  byAdvertisedSku.forEach((skuRows, key) => {
    const productSku = identityBySku.get(key)
    if (!productSku) { unmatchedSkuCount += 1; return }
    const product = salesBySku.get(key) ?? { sku: productSku, sales: 0 }
    const spendExcludingTax = round(sum(skuRows.map(row => row.spendExcludingTax)))
    const allocatedAdsCost = round(spendExcludingTax * (1 + gstRate) * financialScale)
    const attributedSales = round(sum(skuRows.map(row => row.advertisedSkuSales)))
    const grossSales = product.sales
    skus.push({
      sku: product.sku, asin: skuRows.find(row => row.advertisedAsin)?.advertisedAsin ?? '', grossSales,
      attributedSales, estimatedOrganicSales: round(Math.max(0, grossSales - attributedSales)), allocatedAdsCost,
      spendExcludingTax, impressions: sum(skuRows.map(row => row.impressions)), clicks: sum(skuRows.map(row => row.clicks)),
      orders: sum(skuRows.map(row => row.orders)), units: sum(skuRows.map(row => row.units)),
      tacos: grossSales ? allocatedAdsCost / grossSales * 100 : 0,
      attributedRoas: allocatedAdsCost ? attributedSales / allocatedAdsCost : 0,
    })
  })
  skus.sort((left, right) => right.allocatedAdsCost - left.allocatedAdsCost || left.sku.localeCompare(right.sku))
  const allocatedAdsCost = round(sum(skus.map(item => item.allocatedAdsCost)))
  const attributedSales = round(sum(rows.map(row => row.attributedSales)))
  const advertisedSkuSales = round(sum(rows.map(row => row.advertisedSkuSales)))
  const otherSkuSales = round(sum(rows.map(row => row.otherSkuSales)))
  const grossSales = round(sum([...salesBySku.values()].map(item => item.sales)))
  return {
    status: 'AVAILABLE', selectedFrom: range.from, selectedTo: range.to, reportFrom: report.minDate, reportTo: report.maxDate, gstRate,
    unifiedAdsCost, reportSpendExcludingTax, reportSpendIncludingTax, allocatedAdsCost,
    unassignedAdsCost: round(Math.max(0, unifiedAdsCost - allocatedAdsCost)),
    reconciliationDifference: round(unifiedAdsCost - reportSpendIncludingTax), attributedSales, advertisedSkuSales, otherSkuSales,
    estimatedOrganicSales: round(Math.max(0, grossSales - advertisedSkuSales)), matchedSkuCount: skus.length, unmatchedSkuCount, skus,
  }
}
