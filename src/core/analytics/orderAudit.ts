import type { AmountType, CanonicalFinancialEvent } from '../data/types'
import type { OrderProfitSummary } from './orderProfit'
import { parseReportTimestamp } from './timeAnalysis'

export interface OrderAuditBridgeItem { readonly id: string; readonly label: string; readonly value: number; readonly kind: 'INCOME' | 'COST' | 'RESULT' }
export interface OrderAuditTimelineItem { readonly id: string; readonly date: string | null; readonly event: string; readonly amountType: AmountType; readonly rawLabel: string; readonly amount: number; readonly runningBalance: number; readonly classified: boolean }
export interface OrderFeeGroup { readonly label: string; readonly value: number }
export interface OrderAuditResult { readonly bridge: readonly OrderAuditBridgeItem[]; readonly timeline: readonly OrderAuditTimelineItem[]; readonly feeGroups: readonly OrderFeeGroup[]; readonly warnings: readonly string[] }

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export function buildOrderAudit(order: OrderProfitSummary): OrderAuditResult {
  const bridge = ([
    { id: 'sales', label: 'Product sales', value: order.grossSales, kind: 'INCOME' },
    { id: 'tax', label: 'Tax collected', value: order.tax, kind: order.tax >= 0 ? 'INCOME' : 'COST' },
    { id: 'refunds', label: 'Refunds', value: -order.refunds, kind: 'COST' },
    { id: 'shipping', label: 'Net Easy Ship', value: -order.shippingFees, kind: 'COST' },
    { id: 'commission', label: 'Commission', value: -order.commissionCharges, kind: 'COST' },
    { id: 'other-fees', label: 'Other marketplace fees', value: -order.otherMarketplaceCharges, kind: 'COST' },
    { id: 'reimbursements', label: 'Reimbursements', value: order.reimbursements, kind: 'INCOME' },
    { id: 'other', label: 'Other operating', value: order.otherOperating, kind: order.otherOperating >= 0 ? 'INCOME' : 'COST' },
    { id: 'cogs', label: 'Net COGS', value: -order.netCogs, kind: 'COST' },
    { id: 'profit-before-ads', label: 'Profit before ads', value: order.profit + order.advertising, kind: 'RESULT' },
    { id: 'ads', label: 'Direct advertising', value: -order.advertising, kind: 'COST' },
    { id: 'profit', label: 'Profit after direct ads', value: order.profit, kind: 'RESULT' },
  ] satisfies OrderAuditBridgeItem[]).filter(item => item.kind === 'RESULT' || Math.abs(item.value) >= .005)

  let runningBalance = 0
  const timeline = [...order.events].sort((left, right) => {
    const leftTime = parseReportTimestamp(left.date)?.getTime(), rightTime = parseReportTimestamp(right.date)?.getTime()
    return (leftTime ?? Number.MAX_SAFE_INTEGER) - (rightTime ?? Number.MAX_SAFE_INTEGER) || left.sourceRow - right.sourceRow
  }).map(event => {
    if (event.amountClass === 'OPERATING') runningBalance = round(runningBalance + event.amount)
    return { id: event.id, date: event.date, event: event.event, amountType: event.amountType, rawLabel: event.rawType || event.rawDescription || '—', amount: event.amount, runningBalance, classified: event.classified }
  })

  const eventTotal = (predicate: (event: CanonicalFinancialEvent) => boolean) => round(-order.events.filter(event => event.amountClass === 'OPERATING' && predicate(event)).reduce((sum, event) => sum + event.amount, 0))
  const feeGroups: OrderFeeGroup[] = [
    { label: 'Easy Ship charges', value: eventTotal(event => event.amountType === 'SHIPPING_FEE' && event.amount < 0) },
    { label: 'Easy Ship reversals', value: round(order.shippingFeeReversals) },
    { label: 'Commission', value: round(order.commissionCharges) },
    { label: 'Other marketplace fees', value: round(order.otherMarketplaceCharges) },
    { label: 'Direct advertising', value: round(order.advertising) },
    { label: 'Unknown operating amounts', value: eventTotal(event => event.amountType === 'UNKNOWN') },
  ].filter(item => Math.abs(item.value) >= .005)

  const warnings: string[] = []
  if (!order.profitReady || order.missingSkus.length) warnings.push(`Missing product cost: ${order.missingSkus.join(', ') || 'unknown SKU'}`)
  const unknownEvents = order.events.filter(event => !event.classified || event.amountType === 'UNKNOWN').length
  if (unknownEvents) warnings.push(`${unknownEvents} source event${unknownEvents === 1 ? '' : 's'} need classification review`)
  if (order.skus.length > 1) warnings.push('Multiple SKUs share this order; blank-SKU charges may not be attributable to one product')
  if (order.returnQuantity > 0 && !order.returnType) warnings.push('Return exists but its type could not be determined')
  return { bridge, timeline, feeGroups, warnings }
}
