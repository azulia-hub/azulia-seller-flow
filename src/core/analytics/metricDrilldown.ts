import type { CanonicalFinancialEvent } from '../data/types'
import type { SkuProfitSummary } from './orderProfit'
import { summarizeDashboard } from './dashboardSummary'
import { canonicalDateKey } from './dashboardSummary'
import { TIME_PERIOD_OPTIONS, dateInRange, rangeCoverage, recommendTimePeriod, resolveTimePeriod, type DateRange, type TimePeriodPreset } from './timePeriods'

export type MetricDrilldownId = 'GROSS_SALES' | 'PROFIT' | 'PROFIT_MARGIN' | 'ORDERS' | 'RETURN_RATE' | 'TACOS' | 'NET_REVENUE' | 'NET_COGS' | 'ADS' | 'MARKETPLACE_CHARGES' | 'EASY_SHIP' | 'REFUNDS' | 'REIMBURSEMENTS' | 'ASP' | 'PROFIT_BEFORE_ADS' | 'PROFIT_PER_DELIVERED_UNIT' | 'BREAK_EVEN_TACOS'
export type MetricFormat = 'MONEY' | 'PERCENT' | 'NUMBER'
export interface MetricDrilldownRow { readonly sku: string | null; readonly label: string; readonly value: number | null; readonly grossSales: number; readonly orders: number; readonly assigned: boolean; readonly contributionPercent: number; readonly cumulativePercent: number }
export interface MetricPeriodComparison { readonly id: TimePeriodPreset | 'CUSTOM'; readonly label: string; readonly currentValue: number; readonly previousValue: number; readonly currentLabel: string; readonly previousLabel: string; readonly currentCoverage: string; readonly previousCoverage: string; readonly changePercent: number | null; readonly movers: readonly MetricMover[] }
export interface MetricDrilldownOverview { readonly skuCount: number; readonly activeSkuCount: number; readonly assignedTotal: number; readonly unassignedAmount: number; readonly topSku: string | null; readonly topSkuValue: number | null; readonly positiveSkuCount: number; readonly negativeSkuCount: number; readonly zeroSkuCount: number }
export interface MetricTrendPoint { readonly period: string; readonly value: number }
export interface MetricGeographyPoint { readonly location: string; readonly value: number }
export interface MetricMover { readonly sku: string; readonly change: number }
export type SkuActionGroupId = 'STAR' | 'GROWTH' | 'MARGIN_PRESSURE' | 'HIGH_RISK'
export interface SkuActionItem { readonly sku: string; readonly grossSales: number; readonly profit: number; readonly profitMargin: number; readonly orders: number; readonly returnRate: number; readonly rtoRate: number; readonly customerReturnRate: number; readonly easyShipFees: number; readonly reason: string }
export interface SkuActionGroup { readonly id: SkuActionGroupId; readonly label: string; readonly guidance: string; readonly items: readonly SkuActionItem[] }
export interface SkuActionBoard { readonly salesThreshold: number; readonly marginThreshold: number; readonly returnRiskThreshold: number; readonly groups: readonly SkuActionGroup[] }
export interface ConcentrationSku { readonly sku: string; readonly value: number; readonly contributionPercent: number; readonly cumulativePercent: number }
export interface PortfolioConcentration { readonly topFiveSalesShare: number; readonly topFiveProfitShare: number; readonly skusForEightyPercentSales: number; readonly skusForEightyPercentProfit: number; readonly salesContributors: readonly ConcentrationSku[]; readonly profitContributors: readonly ConcentrationSku[] }
export interface MetricDrilldownResult { readonly id: MetricDrilldownId; readonly label: string; readonly format: MetricFormat; readonly total: number; readonly additive: boolean; readonly rows: readonly MetricDrilldownRow[]; readonly overview: MetricDrilldownOverview; readonly trend: readonly MetricTrendPoint[]; readonly geography: readonly MetricGeographyPoint[]; readonly actionBoard: SkuActionBoard; readonly concentration: PortfolioConcentration; readonly profitLeaders: readonly SkuActionItem[]; readonly profitLaggards: readonly SkuActionItem[]; readonly periodComparisons: readonly MetricPeriodComparison[]; readonly recommendedPeriod: TimePeriodPreset | null; readonly unassignedAmount: number; readonly quality: { readonly missingCostSkus: number; readonly unassignedAmount: number; readonly unknownLocationOrders: number; readonly unknownReturnUnits: number } }

const definitions: Record<MetricDrilldownId, { label: string; format: MetricFormat; additive: boolean; value: (item: SkuProfitSummary) => number }> = {
  GROSS_SALES: { label: 'Gross sales', format: 'MONEY', additive: true, value: item => item.grossSales },
  PROFIT: { label: 'Profit after ads', format: 'MONEY', additive: true, value: item => item.profit },
  PROFIT_MARGIN: { label: 'Profit margin', format: 'PERCENT', additive: false, value: item => item.profitMargin },
  ORDERS: { label: 'Orders', format: 'NUMBER', additive: false, value: item => item.orders.length },
  RETURN_RATE: { label: 'Return rate', format: 'PERCENT', additive: false, value: item => item.returnRate },
  TACOS: { label: 'TACOS', format: 'PERCENT', additive: false, value: item => item.grossSales ? item.advertising / item.grossSales * 100 : 0 },
  NET_REVENUE: { label: 'Net product revenue', format: 'MONEY', additive: true, value: item => item.netProductRevenue },
  NET_COGS: { label: 'Net COGS', format: 'MONEY', additive: true, value: item => item.netCogs },
  ADS: { label: 'Ads spend', format: 'MONEY', additive: true, value: item => item.advertising },
  MARKETPLACE_CHARGES: { label: 'Marketplace charges', format: 'MONEY', additive: true, value: item => item.marketplaceCharges },
  EASY_SHIP: { label: 'Net Easy Ship fee', format: 'MONEY', additive: true, value: item => item.shippingFees },
  REFUNDS: { label: 'Refund value', format: 'MONEY', additive: true, value: item => item.grossSales - item.netProductRevenue },
  REIMBURSEMENTS: { label: 'Reimbursements', format: 'MONEY', additive: true, value: item => item.reimbursements },
  ASP: { label: 'Average selling price', format: 'MONEY', additive: false, value: item => item.averageSellingPrice },
  PROFIT_BEFORE_ADS: { label: 'Profit before ads', format: 'MONEY', additive: true, value: item => item.profit + item.advertising },
  PROFIT_PER_DELIVERED_UNIT: { label: 'Profit per delivered unit', format: 'MONEY', additive: false, value: item => item.profitPerDeliveredUnit },
  BREAK_EVEN_TACOS: { label: 'Break-even TACOS', format: 'PERCENT', additive: false, value: item => item.breakEvenTacos },
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const median = (values: readonly number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0 }
const toActionItem = (item: SkuProfitSummary, reason: string): SkuActionItem => ({ sku: item.sku, grossSales: round(item.grossSales), profit: round(item.profit), profitMargin: round(item.profitMargin), orders: item.orders.length, returnRate: round(item.returnRate), rtoRate: item.soldQuantity ? round(item.rtoQuantity / item.soldQuantity * 100) : 0, customerReturnRate: item.soldQuantity ? round(item.customerReturnQuantity / item.soldQuantity * 100) : 0, easyShipFees: round(item.shippingFees), reason })

export function buildPortfolioConcentration(items: readonly SkuProfitSummary[]): PortfolioConcentration {
  const sales = items.map(item => ({ sku: item.sku, value: Math.max(0, item.grossSales) })).filter(item => item.value > 0).sort((a, b) => b.value - a.value || a.sku.localeCompare(b.sku))
  const profit = items.map(item => ({ sku: item.sku, value: Math.max(0, item.profit) })).filter(item => item.value > 0).sort((a, b) => b.value - a.value || a.sku.localeCompare(b.sku))
  const share = (values: readonly { value: number }[]) => { const total = values.reduce((sum, item) => sum + item.value, 0); return total ? round(values.slice(0, 5).reduce((sum, item) => sum + item.value, 0) / total * 100) : 0 }
  const contributors = (values: readonly { sku: string; value: number }[]): ConcentrationSku[] => {
    const total = values.reduce((sum, item) => sum + item.value, 0), target = total * .8
    let cumulative = 0
    const result: ConcentrationSku[] = []
    for (const item of values) {
      if (cumulative >= target) break
      cumulative += item.value
      result.push({ sku: item.sku, value: round(item.value), contributionPercent: total ? round(item.value / total * 100) : 0, cumulativePercent: total ? round(cumulative / total * 100) : 0 })
    }
    return result
  }
  const salesContributors = contributors(sales), profitContributors = contributors(profit)
  return { topFiveSalesShare: share(sales), topFiveProfitShare: share(profit), skusForEightyPercentSales: salesContributors.length, skusForEightyPercentProfit: profitContributors.length, salesContributors, profitContributors }
}

export function buildSkuActionBoard(items: readonly SkuProfitSummary[]): SkuActionBoard {
  const active = items.filter(item => item.grossSales > 0)
  const salesThreshold = round(median(active.map(item => item.grossSales)))
  const marginThreshold = round(median(active.filter(item => item.profit >= 0).map(item => item.profitMargin)))
  const returnRiskThreshold = 20
  const definitions: readonly Omit<SkuActionGroup, 'items'>[] = [
    { id: 'STAR', label: 'Stars', guidance: 'Protect availability and maintain margin.' },
    { id: 'GROWTH', label: 'Growth opportunities', guidance: 'Profitable products that may benefit from more visibility.' },
    { id: 'MARGIN_PRESSURE', label: 'Margin pressure', guidance: 'Strong sales, but margin trails the portfolio benchmark.' },
    { id: 'HIGH_RISK', label: 'High risk', guidance: 'Fix losses or return problems before increasing sales.' },
  ]
  const grouped = new Map<SkuActionGroupId, SkuActionItem[]>()
  active.forEach(item => {
    const highReturn = item.returnRate >= returnRiskThreshold
    const id: SkuActionGroupId = item.profit < 0 || highReturn ? 'HIGH_RISK' : item.grossSales >= salesThreshold && item.profitMargin >= marginThreshold ? 'STAR' : item.grossSales >= salesThreshold ? 'MARGIN_PRESSURE' : 'GROWTH'
    const reason = item.profit < 0 ? 'Losing money' : highReturn ? `Return rate is ${round(item.returnRate)}%` : id === 'STAR' ? 'Strong sales and healthy margin' : id === 'MARGIN_PRESSURE' ? 'Strong sales, below-benchmark margin' : 'Profitable with room to grow'
    const actionItem = toActionItem(item, reason)
    grouped.set(id, [...(grouped.get(id) ?? []), actionItem])
  })
  const groups = definitions.map(group => ({ ...group, items: [...(grouped.get(group.id) ?? [])].sort((left, right) => right.grossSales - left.grossSales || left.sku.localeCompare(right.sku)) }))
  return { salesThreshold, marginThreshold, returnRiskThreshold, groups }
}

export function buildMetricSkuDrilldown(id: MetricDrilldownId, items: readonly SkuProfitSummary[], events: readonly CanonicalFinancialEvent[], comparisonItems: readonly SkuProfitSummary[] = items, customRange?: { current: DateRange; previous: DateRange }): MetricDrilldownResult {
  const definition = definitions[id]
  const summary = summarizeDashboard(events)
  const netCogs = items.reduce((sum, item) => sum + item.netCogs, 0)
  const totals: Record<MetricDrilldownId, number> = {
    GROSS_SALES: summary.grossSales, PROFIT: summary.operatingNet - netCogs,
    PROFIT_MARGIN: summary.grossSales ? (summary.operatingNet - netCogs) / summary.grossSales * 100 : 0,
    ORDERS: new Set(events.flatMap(event => event.orderId ? [event.orderId] : [])).size,
    RETURN_RATE: summary.returnRate, TACOS: summary.tacos, NET_REVENUE: summary.netProductRevenue,
    NET_COGS: netCogs, ADS: summary.adsSpend, MARKETPLACE_CHARGES: summary.marketplaceCharges,
    EASY_SHIP: summary.netEasyShipFee, REFUNDS: summary.refundValue, REIMBURSEMENTS: summary.reimbursements,
    ASP: summary.averageSellingPrice, PROFIT_BEFORE_ADS: summary.operatingNet - netCogs + summary.adsSpend,
    PROFIT_PER_DELIVERED_UNIT: summary.netDeliveredQuantity > 0 ? (summary.operatingNet - netCogs) / summary.netDeliveredQuantity : 0,
    BREAK_EVEN_TACOS: summary.grossSales ? Math.max(0, (summary.operatingNet - netCogs + summary.adsSpend) / summary.grossSales * 100) : 0,
  }
  const bareRows = items.map(item => ({ sku: item.sku, label: item.sku, value: round(definition.value(item)), grossSales: item.grossSales, orders: item.orders.length, assigned: true }))
  const contributionBase = bareRows.reduce((sum, row) => sum + Math.abs(row.value ?? 0), 0)
  let cumulative = 0
  const assignedRows: MetricDrilldownRow[] = [...bareRows].sort((a, b) => Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0)).map(row => {
    const contributionPercent = contributionBase ? Math.abs(row.value ?? 0) / contributionBase * 100 : 0
    cumulative += contributionPercent
    return { ...row, contributionPercent: round(contributionPercent), cumulativePercent: round(cumulative) }
  })
  const assigned = assignedRows.reduce((sum, row) => sum + (row.value ?? 0), 0)
  const unassignedAmount = definition.additive ? round(totals[id] - assigned) : 0
  const rows: MetricDrilldownRow[] = [...assignedRows]
  if (Math.abs(unassignedAmount) >= .01) rows.push({ sku: null, label: 'Unassigned', value: unassignedAmount, grossSales: 0, orders: 0, assigned: false, contributionPercent: 0, cumulativePercent: 100 })
  rows.sort((a, b) => Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0) || a.label.localeCompare(b.label))
  const activeRows = assignedRows.filter(row => Math.abs(row.value ?? 0) >= .01)
  const top = [...activeRows].sort((a, b) => Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0))[0]
  const uniqueOrders = new Map(items.flatMap(item => item.orders).map(order => [order.orderId, order]))
  type Order = (typeof items)[number]['orders'][number]
  const groupValue = (orders: readonly Order[]) => {
    const gross = orders.reduce((sum, order) => sum + order.grossSales, 0), profit = orders.reduce((sum, order) => sum + order.profit, 0), ads = orders.reduce((sum, order) => sum + order.advertising, 0)
    const sold = orders.reduce((sum, order) => sum + order.events.filter(event => event.event === 'SALE' && event.amountType === 'PRODUCT_REVENUE').reduce((total, event) => total + (event.quantity ?? 0), 0), 0)
    const returned = orders.reduce((sum, order) => sum + order.events.filter(event => event.event === 'REFUND' && event.amountType === 'PRODUCT_REVENUE').reduce((total, event) => total + (event.quantity ?? 0), 0), 0)
    const delivered = sold - returned
    return id === 'GROSS_SALES' ? gross : id === 'PROFIT' ? profit : id === 'PROFIT_MARGIN' ? (gross ? profit / gross * 100 : 0) : id === 'NET_REVENUE' ? gross - orders.reduce((sum, order) => sum + order.refunds, 0) : id === 'NET_COGS' ? orders.reduce((sum, order) => sum + order.netCogs, 0) : id === 'ADS' ? ads : id === 'TACOS' ? (gross ? ads / gross * 100 : 0) : id === 'MARKETPLACE_CHARGES' ? orders.reduce((sum, order) => sum + order.marketplaceCharges, 0) : id === 'EASY_SHIP' ? orders.reduce((sum, order) => sum + order.shippingFees, 0) : id === 'REFUNDS' ? orders.reduce((sum, order) => sum + order.refunds, 0) : id === 'REIMBURSEMENTS' ? orders.reduce((sum, order) => sum + order.reimbursements, 0) : id === 'PROFIT_BEFORE_ADS' ? profit + ads : id === 'PROFIT_PER_DELIVERED_UNIT' ? (delivered > 0 ? profit / delivered : 0) : id === 'BREAK_EVEN_TACOS' ? (gross ? Math.max(0, (profit + ads) / gross * 100) : 0) : id === 'ORDERS' ? orders.length : id === 'RETURN_RATE' ? (sold ? returned / sold * 100 : 0) : id === 'ASP' ? (sold ? gross / sold : 0) : 0
  }
  const trendGroups = new Map<string, Order[]>(), geoGroups = new Map<string, Order[]>()
  uniqueOrders.forEach(order => { const period = canonicalDateKey(order.date); if (period) trendGroups.set(period, [...(trendGroups.get(period) ?? []), order]); const location = order.state?.trim() || 'Unknown location'; geoGroups.set(location, [...(geoGroups.get(location) ?? []), order]) })
  const trend = [...trendGroups].map(([period, orders]) => ({ period, value: round(groupValue(orders)) })).sort((a, b) => a.period.localeCompare(b.period))
  const overview = { skuCount: assignedRows.length, activeSkuCount: activeRows.length, assignedTotal: round(assigned), unassignedAmount, topSku: top?.sku ?? null, topSkuValue: top?.value ?? null, positiveSkuCount: assignedRows.filter(row => (row.value ?? 0) > 0).length, negativeSkuCount: assignedRows.filter(row => (row.value ?? 0) < 0).length, zeroSkuCount: assignedRows.filter(row => Math.abs(row.value ?? 0) < .01).length }
  const geography = [...geoGroups].map(([location, orders]) => ({ location, value: round(groupValue(orders)) })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 20)
  const comparisonOrders = new Map(comparisonItems.flatMap(item => item.orders).map(order => [order.orderId, order]))
  const datedOrders = [...comparisonOrders.values()].filter(order => canonicalDateKey(order.date))
  const extent = datedOrders.map(order => canonicalDateKey(order.date)!).sort()
  const buildComparison = (option: { id: TimePeriodPreset | 'CUSTOM'; label: string }, period: { current: DateRange; previous: DateRange }): MetricPeriodComparison => {
    const currentValue = round(groupValue(datedOrders.filter(order => dateInRange(canonicalDateKey(order.date), period.current))))
    const previousValue = round(groupValue(datedOrders.filter(order => dateInRange(canonicalDateKey(order.date), period.previous))))
    const movers = comparisonItems.map(item => ({ sku: item.sku, change: round(groupValue(item.orders.filter(order => dateInRange(canonicalDateKey(order.date), period.current))) - groupValue(item.orders.filter(order => dateInRange(canonicalDateKey(order.date), period.previous)))) })).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 8)
    return { id: option.id, label: option.label, currentValue, previousValue, currentLabel: `${period.current.from} to ${period.current.to}`, previousLabel: `${period.previous.from} to ${period.previous.to}`, currentCoverage: rangeCoverage(period.current, extent[0], extent.at(-1)!), previousCoverage: rangeCoverage(period.previous, extent[0], extent.at(-1)!), changePercent: previousValue ? round((currentValue - previousValue) / Math.abs(previousValue) * 100) : null, movers }
  }
  const periodComparisons: MetricPeriodComparison[] = extent.length ? TIME_PERIOD_OPTIONS.map(option => buildComparison(option, resolveTimePeriod(option.id, extent.at(-1)!))) : []
  if (extent.length && customRange) periodComparisons.push(buildComparison({ id: 'CUSTOM', label: 'Custom range' }, customRange))
  const actionBoard = buildSkuActionBoard(items)
  const concentration = buildPortfolioConcentration(items)
  const profitRanked = items.filter(item => item.grossSales > 0).sort((left, right) => right.profit - left.profit || left.sku.localeCompare(right.sku))
  const leaderCount = Math.min(5, Math.ceil(profitRanked.length / 2)), laggardCount = Math.min(5, Math.floor(profitRanked.length / 2))
  const profitLeaders = profitRanked.slice(0, leaderCount).map(item => toActionItem(item, 'Highest profit contribution'))
  const profitLaggards = profitRanked.slice(-laggardCount || profitRanked.length).reverse().map(item => toActionItem(item, item.profit < 0 ? 'Loss-making SKU' : 'Lowest profit contribution'))
  const quality = { missingCostSkus: items.filter(item => item.missingCost).length, unassignedAmount, unknownLocationOrders: [...uniqueOrders.values()].filter(order => !order.state).length, unknownReturnUnits: items.reduce((sum, item) => sum + item.unknownReturnQuantity, 0) }
  return { id, label: definition.label, format: definition.format, total: round(totals[id]), additive: definition.additive, rows, overview, trend, geography, actionBoard, concentration, profitLeaders, profitLaggards, periodComparisons, recommendedPeriod: extent.length ? recommendTimePeriod(extent[0], extent.at(-1)!) : null, unassignedAmount, quality }
}
