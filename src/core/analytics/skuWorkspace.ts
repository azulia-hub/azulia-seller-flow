import type { SkuAdvertisingSummary } from './advertisingSummary'
import type { OrderProfitSummary, SkuProfitSummary } from './orderProfit'
import { buildReturnTrend } from './returnSummary'
import { canonicalDateKey } from './dashboardSummary'
import { summarizeAdvertising, type AdvertisingTrendPoint } from './advertisingSummary'

export interface SkuWaterfallItem { readonly id: string; readonly label: string; readonly value: number; readonly kind: 'INCOME' | 'COST' | 'ADJUSTMENT' }
export interface SkuWorkspaceSummary {
  readonly snapshot: readonly { label: string; value: number; format: 'MONEY' | 'PERCENT' | 'NUMBER' }[]
  readonly waterfall: readonly SkuWaterfallItem[]
  readonly returns: { readonly rtoRate: number; readonly customerReturnRate: number; readonly returnLoss: number; readonly lossPerReturn: number; readonly charges: number; readonly shippingReversals: number; readonly recoveredCogs: number; readonly reimbursements: number; readonly trend: ReturnType<typeof buildReturnTrend> }
  readonly advertising: { readonly direct: number; readonly tacos: number | null; readonly roas: number | null; readonly profitBeforeAds: number; readonly profitAfterAds: number | null; readonly marginImpact: number | null; readonly breakEvenTacos: number; readonly attribution: string; readonly trend: readonly AdvertisingTrendPoint[] }
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export function buildSkuWorkspace(product: SkuProfitSummary, advertising?: SkuAdvertisingSummary): SkuWorkspaceSummary {
  const events = [...new Map(product.orders.flatMap(order => order.events).map(event => [event.id, event])).values()]
  const directAds = advertising?.directAdsSpend ?? product.advertising
  const hasDirectAttribution = directAds > 0
  const profitAfterDirectAds = hasDirectAttribution ? round(product.profitBeforeAds - directAds) : null
  return {
    snapshot: [
      { label: 'Gross sales', value: product.grossSales, format: 'MONEY' }, { label: 'Profit before ads', value: product.profitBeforeAds, format: 'MONEY' },
      { label: 'Pre-ad margin', value: product.grossSales ? product.profitBeforeAds / product.grossSales * 100 : 0, format: 'PERCENT' }, { label: 'Units sold', value: product.soldQuantity, format: 'NUMBER' },
      { label: 'Net delivered', value: product.netDeliveredQuantity, format: 'NUMBER' }, { label: 'Return rate', value: product.returnRate, format: 'PERCENT' },
      { label: 'Average selling price', value: product.averageSellingPrice, format: 'MONEY' }, { label: 'Profit / delivered unit', value: product.profitPerDeliveredUnit, format: 'MONEY' },
      { label: 'Pre-ad profit / delivered unit', value: product.netDeliveredQuantity ? product.profitBeforeAds / product.netDeliveredQuantity : 0, format: 'MONEY' }, { label: 'Break-even TACOS', value: product.breakEvenTacos, format: 'PERCENT' },
    ],
    waterfall: [
      { id: 'sales', label: 'Gross sales', value: product.grossSales, kind: 'INCOME' }, { id: 'refunds', label: 'Product refunds', value: -(product.grossSales - product.netProductRevenue), kind: 'COST' },
      { id: 'promotions', label: 'Promotional discounts', value: -product.promotionAmount, kind: 'COST' }, { id: 'shipping-income', label: 'Shipping & gift-wrap income', value: product.shippingAndGiftRevenue, kind: 'INCOME' },
      { id: 'tax', label: 'Tax included', value: product.tax, kind: 'INCOME' }, { id: 'commission', label: 'Marketplace commission', value: -product.commissionCharges, kind: 'COST' }, { id: 'marketplace-other', label: 'Other marketplace fees', value: -product.otherMarketplaceCharges, kind: 'COST' },
      { id: 'easyship', label: 'Net shipping fee', value: -product.shippingFees, kind: 'COST' }, { id: 'ads', label: 'Directly attributed advertising', value: -directAds, kind: 'COST' },
      { id: 'reimbursements', label: 'Reimbursements', value: product.reimbursements, kind: 'INCOME' }, { id: 'other', label: 'Other operating adjustments', value: product.otherOperating, kind: 'ADJUSTMENT' },
      { id: 'cogs', label: 'Net COGS', value: -product.netCogs, kind: 'COST' }, { id: 'profit', label: hasDirectAttribution ? 'Profit after direct ads' : 'Profit before ads', value: profitAfterDirectAds ?? product.profitBeforeAds, kind: 'ADJUSTMENT' },
    ],
    returns: { rtoRate: product.soldQuantity ? product.rtoQuantity / product.soldQuantity * 100 : 0, customerReturnRate: product.soldQuantity ? product.customerReturnQuantity / product.soldQuantity * 100 : 0, returnLoss: product.returnLoss, lossPerReturn: product.returnQuantity ? product.returnLoss / product.returnQuantity : 0, charges: product.returnCharges, shippingReversals: product.shippingFeeReversals, recoveredCogs: product.recoveredCogs, reimbursements: product.reimbursements, trend: buildReturnTrend(events, 'DAY') },
    advertising: { direct: directAds, tacos: hasDirectAttribution && product.grossSales ? directAds / product.grossSales * 100 : null, roas: hasDirectAttribution ? product.grossSales / directAds : null, profitBeforeAds: product.profitBeforeAds, profitAfterAds: profitAfterDirectAds, marginImpact: hasDirectAttribution && product.grossSales ? directAds / product.grossSales * 100 : null, breakEvenTacos: product.breakEvenTacos, attribution: hasDirectAttribution ? 'DIRECT' : 'UNATTRIBUTED', trend: summarizeAdvertising(events).trend },
  }
}

export interface AdvancedOrderFilter { readonly fromDate?: string; readonly toDate?: string; readonly state?: string; readonly city?: string; readonly accountType?: string; readonly fulfillmentType?: string; readonly status?: string; readonly activity?: 'ALL' | 'SALE' | 'REFUND' | 'REIMBURSEMENT'; readonly returnType?: 'ALL' | 'RTO' | 'CUSTOMER_RETURN' | 'UNKNOWN'; readonly profitability?: 'ALL' | 'PROFITABLE' | 'LOSS'; readonly shippingReversalOnly?: boolean; readonly missingCostOnly?: boolean }
export function filterSkuWorkspaceOrders(orders: readonly OrderProfitSummary[], filter: AdvancedOrderFilter): OrderProfitSummary[] {
  return orders.filter(order => {
    const date = canonicalDateKey(order.date) ?? ''
    if (filter.fromDate && date && date < filter.fromDate || filter.toDate && date && date > filter.toDate) return false
    if (filter.state && order.state !== filter.state || filter.city && order.city !== filter.city || filter.accountType && order.accountType !== filter.accountType || filter.fulfillmentType && order.fulfillmentType !== filter.fulfillmentType || filter.status && order.status !== filter.status) return false
    if (filter.activity && filter.activity !== 'ALL' && !order.events.some(event => event.event === filter.activity)) return false
    if (filter.returnType && filter.returnType !== 'ALL' && order.returnType !== filter.returnType) return false
    if (filter.profitability === 'PROFITABLE' && order.profit < 0 || filter.profitability === 'LOSS' && order.profit >= 0) return false
    if (filter.shippingReversalOnly && !order.events.some(event => event.amountType === 'SHIPPING_FEE' && event.amount > 0) || filter.missingCostOnly && order.missingSkus.length === 0) return false
    return true
  })
}
