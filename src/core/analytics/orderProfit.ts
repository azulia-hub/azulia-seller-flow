import type { CanonicalFinancialEvent } from '../data/types'
import { calculateCosts, type MissingCostPolicy } from '../costs/calculateCosts'
import type { AppliedProductCost } from '../costs/calculateCosts'
import type { ProductCost } from '../costs/types'
import { canonicalDateKey, summarizeDashboard } from './dashboardSummary'
import { calculateUnitEconomics } from './unitEconomics'
import { summarizeReturns } from './returnSummary'

export interface OrderProfitSummary {
  readonly orderId: string
  readonly date: string | null
  readonly skus: readonly string[]
  readonly state: string | null
  readonly city: string | null
  readonly accountType: string | null
  readonly fulfillmentType: string | null
  readonly status: string | null
  readonly grossSales: number
  readonly soldQuantity: number
  readonly returnQuantity: number
  readonly refunds: number
  readonly marketplaceCharges: number
  readonly commissionCharges: number
  readonly otherMarketplaceCharges: number
  readonly shippingFees: number
  readonly grossShippingFees: number
  readonly shippingFeeReversals: number
  readonly advertising: number
  readonly reimbursements: number
  readonly tax: number
  readonly otherOperating: number
  readonly operatingNet: number
  readonly netCogs: number
  readonly profit: number
  readonly profitPerDeliveredUnit: number | null
  readonly breakEvenTacos: number | null
  readonly profitReady: boolean
  readonly missingSkus: readonly string[]
  readonly returnType: 'RTO' | 'CUSTOMER_RETURN' | 'UNKNOWN' | null
  readonly returnEvidence: string | null
  readonly events: readonly CanonicalFinancialEvent[]
  readonly costApplications?: readonly AppliedProductCost[]
}

export interface SkuTrendPoint {
  readonly date: string
  readonly grossSales: number
  readonly profit: number
  readonly returns: number
}

export interface SkuProfitSummary {
  readonly sku: string
  readonly grossSales: number
  readonly netProductRevenue: number
  readonly soldQuantity: number
  readonly returnQuantity: number
  readonly rtoQuantity: number
  readonly customerReturnQuantity: number
  readonly unknownReturnQuantity: number
  readonly netDeliveredQuantity: number
  readonly returnRate: number
  readonly averageSellingPrice: number
  readonly marketplaceCharges: number
  readonly commissionCharges: number
  readonly otherMarketplaceCharges: number
  readonly shippingFees: number
  readonly grossShippingFees: number
  readonly shippingFeeReversals: number
  readonly promotionAmount: number
  readonly shippingAndGiftRevenue: number
  readonly tax: number
  readonly otherOperating: number
  readonly reimbursements: number
  readonly advertising: number
  readonly netCogs: number
  readonly operatingNet: number
  readonly profit: number
  readonly profitBeforeAds: number
  readonly profitMargin: number
  readonly roi: number
  readonly roas: number
  readonly profitPerDeliveredUnit: number
  readonly breakEvenTacos: number
  readonly profitReady: boolean
  readonly missingCost: boolean
  readonly returnLoss: number
  readonly returnCharges: number
  readonly recoveredCogs: number
  readonly trend: readonly SkuTrendPoint[]
  readonly orders: readonly OrderProfitSummary[]
}

export interface ProductProfitabilityFilterSpec {
  readonly search?: string
  readonly status?: 'ALL' | 'PROFITABLE' | 'LOSS_MAKING' | 'MISSING_COST'
  readonly minimumSales?: number
  readonly sort?: 'GROSS_SALES' | 'PROFIT' | 'MARGIN' | 'ROI' | 'RETURN_RATE' | 'NET_COGS' | 'PROFIT_PER_UNIT' | 'BREAK_EVEN_TACOS'
  readonly direction?: 'ASC' | 'DESC'
}

export interface SkuOrderFilterSpec { readonly status?: string; readonly returnType?: OrderProfitSummary['returnType'] | 'ALL'; readonly accountType?: string; readonly fulfillmentType?: string; readonly transactionCategory?: 'ALL' | 'SALE' | 'REFUND' | 'FEE' | 'REIMBURSEMENT' }
export type GeographyLevel = 'STATE' | 'CITY'
export interface OrderGeographySummary { readonly location: string; readonly orderCount: number; readonly grossSales: number; readonly refundValue: number; readonly soldQuantity: number; readonly netDeliveredQuantity: number; readonly averageSellingPrice: number; readonly profit: number; readonly profitMargin: number; readonly easyShipFees: number; readonly marketplaceCharges: number; readonly netCogs: number; readonly advertising: number; readonly reimbursements: number; readonly rtoQuantity: number; readonly customerReturnQuantity: number; readonly unknownReturnQuantity: number; readonly returnQuantity: number; readonly returnRate: number }

export function filterSkuOrders(items: readonly OrderProfitSummary[], spec: SkuOrderFilterSpec): OrderProfitSummary[] {
  return items.filter((item) => {
    if (spec.status && item.status !== spec.status) return false
    if (spec.returnType && spec.returnType !== 'ALL' && item.returnType !== spec.returnType) return false
    if (spec.accountType && item.accountType !== spec.accountType) return false
    if (spec.fulfillmentType && item.fulfillmentType !== spec.fulfillmentType) return false
    if (spec.transactionCategory && spec.transactionCategory !== 'ALL' && !item.events.some((event) => event.event === spec.transactionCategory)) return false
    return true
  })
}

export function summarizeOrderGeography(items: readonly OrderProfitSummary[], level: GeographyLevel): OrderGeographySummary[] {
  const groups = new Map<string, OrderProfitSummary[]>()
  items.forEach((item) => {
    const location = (level === 'STATE' ? item.state : item.city)?.trim() || 'Unknown location'
    groups.set(location, [...(groups.get(location) ?? []), item])
  })
  return [...groups].map(([location, orders]) => {
    const grossSales = round(orders.reduce((total, order) => total + order.grossSales, 0))
    const profit = round(orders.reduce((total, order) => total + order.profit, 0))
    const returned = (type: NonNullable<OrderProfitSummary['returnType']>) => orders.reduce((total, order) => total + order.events.filter((event) => event.event === 'REFUND' && event.amountType === 'PRODUCT_REVENUE' && (event.returnType ?? 'UNKNOWN') === type).reduce((quantity, event) => quantity + (event.quantity ?? 0), 0), 0)
    const soldQuantity = orders.reduce((total, order) => total + order.events.filter((event) => event.event === 'SALE' && event.amountType === 'PRODUCT_REVENUE' && event.amount > 0).reduce((quantity, event) => quantity + (event.quantity ?? 0), 0), 0)
    const rtoQuantity = returned('RTO'), customerReturnQuantity = returned('CUSTOMER_RETURN'), unknownReturnQuantity = returned('UNKNOWN')
    const returnQuantity = rtoQuantity + customerReturnQuantity + unknownReturnQuantity
    return { location, orderCount: orders.length, grossSales, refundValue: round(orders.reduce((total, order) => total + order.refunds, 0)), soldQuantity, netDeliveredQuantity: soldQuantity - returnQuantity, averageSellingPrice: soldQuantity ? round(grossSales / soldQuantity) : 0, profit, profitMargin: grossSales ? round(profit / grossSales * 100) : 0, easyShipFees: round(orders.reduce((total, order) => total + order.shippingFees, 0)), marketplaceCharges: round(orders.reduce((total, order) => total + order.marketplaceCharges, 0)), netCogs: round(orders.reduce((total, order) => total + order.netCogs, 0)), advertising: round(orders.reduce((total, order) => total + order.advertising, 0)), reimbursements: round(orders.reduce((total, order) => total + order.reimbursements, 0)), rtoQuantity, customerReturnQuantity, unknownReturnQuantity, returnQuantity, returnRate: soldQuantity ? round(returnQuantity / soldQuantity * 100) : 0 }
  }).sort((left, right) => right.grossSales - left.grossSales || left.location.localeCompare(right.location))
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export function summarizeOrders(
  events: readonly CanonicalFinancialEvent[],
  costs: readonly ProductCost[],
  policy: MissingCostPolicy,
  normalizeSku?: (sku: string) => string,
): OrderProfitSummary[] {
  const grouped = new Map<string, CanonicalFinancialEvent[]>()
  events.forEach((event) => {
    if (!event.orderId) return
    grouped.set(event.orderId, [...(grouped.get(event.orderId) ?? []), event])
  })

  return [...grouped].map(([orderId, orderEvents]) => {
    const summary = summarizeDashboard(orderEvents)
    const cost = calculateCosts(orderEvents, costs, policy, normalizeSku)
    const explained = summary.grossSales - summary.refundValue - summary.marketplaceCharges
      - summary.netEasyShipFee - summary.adsSpend + summary.reimbursements + summary.taxNet
    const profit = round(summary.operatingNet - cost.netCogs)
    const orderUnitEconomics = calculateUnitEconomics({ grossSales: summary.grossSales, netDeliveredQuantity: summary.netDeliveredQuantity, profitAfterAds: profit, adsSpend: summary.adsSpend, profitReady: cost.profitReady })
    const returnEvent = orderEvents.find((event) => event.event === 'REFUND' && event.amountType === 'PRODUCT_REVENUE')
    return {
      orderId,
      date: orderEvents.find((event) => event.date)?.date ?? null,
      skus: [...new Set(orderEvents.flatMap((event) => event.sku ? [event.sku] : []))],
      state: orderEvents.find((event) => event.state)?.state ?? null,
      city: orderEvents.find((event) => event.city)?.city ?? null,
      accountType: orderEvents.find((event) => event.accountType)?.accountType ?? null,
      fulfillmentType: orderEvents.find((event) => event.fulfillmentType)?.fulfillmentType ?? null,
      status: orderEvents.find((event) => event.status)?.status ?? null,
      grossSales: summary.grossSales,
      soldQuantity: summary.soldQuantity,
      returnQuantity: summary.returnQuantity,
      refunds: summary.refundValue,
      marketplaceCharges: summary.marketplaceCharges,
      commissionCharges: round(-orderEvents.filter(event => event.amountClass === 'OPERATING' && event.amountType === 'COMMISSION').reduce((sum, event) => sum + event.amount, 0)),
      otherMarketplaceCharges: round(summary.marketplaceCharges + orderEvents.filter(event => event.amountClass === 'OPERATING' && event.amountType === 'COMMISSION').reduce((sum, event) => sum + event.amount, 0)),
      shippingFees: summary.netEasyShipFee,
      grossShippingFees: round(-orderEvents.filter(event => event.amountClass === 'OPERATING' && event.amountType === 'SHIPPING_FEE' && event.amount < 0).reduce((sum, event) => sum + event.amount, 0)),
      shippingFeeReversals: round(orderEvents.filter(event => event.amountClass === 'OPERATING' && event.amountType === 'SHIPPING_FEE' && event.amount > 0).reduce((sum, event) => sum + event.amount, 0)),
      advertising: summary.adsSpend,
      reimbursements: summary.reimbursements,
      tax: summary.taxNet,
      otherOperating: round(summary.operatingNet - explained),
      operatingNet: summary.operatingNet,
      netCogs: cost.netCogs,
      profit,
      profitPerDeliveredUnit: orderUnitEconomics.profitPerDeliveredUnit,
      breakEvenTacos: orderUnitEconomics.breakEvenTacos,
      profitReady: cost.profitReady,
      missingSkus: cost.missingSkus,
      returnType: returnEvent?.returnType ?? (returnEvent ? 'UNKNOWN' : null),
      returnEvidence: returnEvent?.returnEvidence ?? null,
      events: orderEvents,
      costApplications: cost.appliedCosts,
    }
  }).sort((a, b) => (canonicalDateKey(b.date) ?? '').localeCompare(canonicalDateKey(a.date) ?? '') || a.orderId.localeCompare(b.orderId))
}

export function summarizeSkuProfit(
  events: readonly CanonicalFinancialEvent[],
  sku: string,
  costs: readonly ProductCost[],
  policy: MissingCostPolicy,
  normalizeSku?: (sku: string) => string,
): SkuProfitSummary {
  const orderSkus = new Map<string, Set<string>>()
  events.forEach((event) => {
    if (!event.orderId || !event.sku || event.amountType !== 'PRODUCT_REVENUE') return
    const skus = orderSkus.get(event.orderId) ?? new Set<string>()
    skus.add(event.sku)
    orderSkus.set(event.orderId, skus)
  })
  const skuOrderIds = new Set([...orderSkus].flatMap(([orderId, skus]) => skus.has(sku) ? [orderId] : []))
  const skuEvents = events.filter((event) => event.sku === sku || (!event.sku && event.orderId && skuOrderIds.has(event.orderId) && orderSkus.get(event.orderId)?.size === 1))
  const summary = summarizeDashboard(skuEvents)
  const cost = calculateCosts(skuEvents, costs, policy, normalizeSku)
  const profit = round(summary.operatingNet - cost.netCogs)
  const unitEconomics = calculateUnitEconomics({ grossSales: summary.grossSales, netDeliveredQuantity: summary.netDeliveredQuantity, profitAfterAds: profit, adsSpend: summary.adsSpend, profitReady: cost.profitReady })
  const returns = summarizeReturns(skuEvents, costs, normalizeSku)
  const byDate = new Map<string, CanonicalFinancialEvent[]>()
  skuEvents.forEach((event) => {
    const date = canonicalDateKey(event.date)
    if (date) byDate.set(date, [...(byDate.get(date) ?? []), event])
  })
  const trend = [...byDate].map(([date, dayEvents]) => {
    const day = summarizeDashboard(dayEvents)
    const dayCost = calculateCosts(dayEvents, costs, policy, normalizeSku)
    return { date, grossSales: day.grossSales, profit: round(day.operatingNet - dayCost.netCogs), returns: day.returnQuantity }
  }).sort((a, b) => a.date.localeCompare(b.date))

  const shippingEvents = skuEvents.filter(event => event.amountClass === 'OPERATING' && event.amountType === 'SHIPPING_FEE')
  const explained = summary.grossSales - summary.refundValue - summary.marketplaceCharges - summary.netEasyShipFee - summary.adsSpend + summary.reimbursements + summary.taxNet
  const skuReturns = returns.skuSummaries.find(item => item.sku === sku)
  return {
    sku,
    grossSales: summary.grossSales,
    netProductRevenue: summary.netProductRevenue,
    soldQuantity: summary.soldQuantity,
    returnQuantity: summary.returnQuantity,
    rtoQuantity: returns.rtoQuantity,
    customerReturnQuantity: returns.customerReturnQuantity,
    unknownReturnQuantity: returns.unknownQuantity,
    netDeliveredQuantity: summary.netDeliveredQuantity,
    returnRate: summary.returnRate,
    averageSellingPrice: summary.averageSellingPrice,
    marketplaceCharges: summary.marketplaceCharges,
    commissionCharges: round(-skuEvents.filter(event => event.amountClass === 'OPERATING' && event.amountType === 'COMMISSION').reduce((sum, event) => sum + event.amount, 0)),
    otherMarketplaceCharges: round(summary.marketplaceCharges + skuEvents.filter(event => event.amountClass === 'OPERATING' && event.amountType === 'COMMISSION').reduce((sum, event) => sum + event.amount, 0)),
    shippingFees: summary.netEasyShipFee,
    grossShippingFees: round(-shippingEvents.filter(event => event.amount < 0).reduce((sum, event) => sum + event.amount, 0)),
    shippingFeeReversals: round(shippingEvents.filter(event => event.amount > 0).reduce((sum, event) => sum + event.amount, 0)),
    promotionAmount: round(-skuEvents.filter(event => event.amountClass === 'OPERATING' && event.amountType === 'PROMOTION').reduce((sum, event) => sum + event.amount, 0)),
    shippingAndGiftRevenue: round(skuEvents.filter(event => event.amountClass === 'OPERATING' && (event.amountType === 'SHIPPING_REVENUE' || event.amountType === 'GIFT_WRAP_REVENUE')).reduce((sum, event) => sum + event.amount, 0)),
    tax: summary.taxNet,
    otherOperating: round(summary.operatingNet - explained),
    reimbursements: summary.reimbursements,
    advertising: summary.adsSpend,
    netCogs: cost.netCogs,
    operatingNet: summary.operatingNet,
    profit,
    profitBeforeAds: round(profit + summary.adsSpend),
    profitMargin: summary.grossSales ? round(profit / summary.grossSales * 100) : 0,
    roi: cost.netCogs ? round(profit / cost.netCogs * 100) : 0,
    roas: summary.adsSpend ? round(summary.grossSales / summary.adsSpend) : 0,
    profitPerDeliveredUnit: unitEconomics.profitPerDeliveredUnit ?? 0,
    breakEvenTacos: unitEconomics.breakEvenTacos ?? 0,
    profitReady: cost.profitReady,
    missingCost: cost.missingSkus.length > 0,
    returnLoss: skuReturns?.returnLoss ?? 0,
    returnCharges: round(Math.abs(skuReturns?.netShipping ?? 0) + Math.abs(skuReturns?.marketplaceCharges ?? 0)),
    recoveredCogs: skuReturns?.cogsRecovered ?? 0,
    trend,
    orders: summarizeOrders(skuEvents, costs, policy, normalizeSku),
  }
}

export function summarizeProductProfitability(events: readonly CanonicalFinancialEvent[], costs: readonly ProductCost[], policy: MissingCostPolicy, normalizeSku?: (sku: string) => string): SkuProfitSummary[] {
  const skus = [...new Set(events.flatMap((event) => event.sku && event.amountType === 'PRODUCT_REVENUE' ? [event.sku] : []))]
  return skus.map((sku) => summarizeSkuProfit(events, sku, costs, policy, normalizeSku))
}

export function filterProductProfitability(items: readonly SkuProfitSummary[], spec: ProductProfitabilityFilterSpec): SkuProfitSummary[] {
  const search = spec.search?.trim().toLocaleLowerCase()
  const filtered = items.filter((item) => {
    if (search && !item.sku.toLocaleLowerCase().includes(search)) return false
    if ((spec.minimumSales ?? 0) > item.grossSales) return false
    if (spec.status === 'PROFITABLE' && item.profit < 0) return false
    if (spec.status === 'LOSS_MAKING' && item.profit >= 0) return false
    if (spec.status === 'MISSING_COST' && !item.missingCost) return false
    return true
  })
  const key = spec.sort ?? 'PROFIT'
  const value = (item: SkuProfitSummary) => key === 'GROSS_SALES' ? item.grossSales : key === 'MARGIN' ? item.profitMargin : key === 'ROI' ? item.roi : key === 'RETURN_RATE' ? item.returnRate : key === 'NET_COGS' ? item.netCogs : key === 'PROFIT_PER_UNIT' ? item.profitPerDeliveredUnit : key === 'BREAK_EVEN_TACOS' ? item.breakEvenTacos : item.profit
  const direction = spec.direction === 'ASC' ? 1 : -1
  return [...filtered].sort((left, right) => direction * (value(left) - value(right)) || left.sku.localeCompare(right.sku))
}

export function summarizeProductPortfolio(items: readonly SkuProfitSummary[], events: readonly CanonicalFinancialEvent[]) {
  const assignedAdvertising = round(items.reduce((sum, item) => sum + item.advertising, 0))
  const allAdvertising = summarizeDashboard(events).adsSpend
  const attributedOperating = round(items.reduce((sum, item) => sum + item.operatingNet, 0))
  const allOperating = summarizeDashboard(events).operatingNet
  return {
    skuCount: items.length,
    profitableSkuCount: items.filter((item) => item.profit >= 0 && !item.missingCost).length,
    lossMakingSkuCount: items.filter((item) => item.profit < 0 && !item.missingCost).length,
    missingCostSkuCount: items.filter((item) => item.missingCost).length,
    grossSales: round(items.reduce((sum, item) => sum + item.grossSales, 0)),
    profit: round(items.reduce((sum, item) => sum + item.profit, 0)),
    netCogs: round(items.reduce((sum, item) => sum + item.netCogs, 0)),
    assignedAdvertising,
    unassignedAdvertising: round(allAdvertising - assignedAdvertising),
    unassignedOperating: round(allOperating - attributedOperating),
    portfolioProfit: round(allOperating - items.reduce((sum, item) => sum + item.netCogs, 0)),
    topProfitSkus: filterProductProfitability(items, { sort: 'PROFIT' }).slice(0, 6),
    lossSkus: filterProductProfitability(items, { sort: 'PROFIT', direction: 'ASC' }).filter((item) => item.profit < 0).slice(0, 6),
  }
}
