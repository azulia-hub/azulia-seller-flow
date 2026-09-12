import type { CanonicalFinancialEvent } from '../data/types'
import type { OrderProfitSummary } from './orderProfit'

export type FeeIssueKind = 'HIGH_FEE_SHARE' | 'FEES_EXCEED_PROFIT' | 'SHIPPING_NOT_REVERSED' | 'PARTIAL_SHIPPING_REVERSAL' | 'DUPLICATE_FEE' | 'COMMISSION_RATE_CHANGE'

export interface FeeAuditIssue {
  readonly id: string
  readonly kind: FeeIssueKind
  readonly label: string
  readonly explanation: string
  readonly orderId: string
  readonly skus: readonly string[]
  readonly amount: number
  readonly severity: 'WARNING' | 'CRITICAL'
}

export interface FeeAuditSku {
  readonly sku: string
  readonly issueCount: number
  readonly flaggedCharges: number
  readonly grossSales: number
  readonly feeShare: number
  readonly orderIds: readonly string[]
}

export interface FeeAuditResult {
  readonly issueCount: number
  readonly criticalCount: number
  readonly affectedOrderCount: number
  readonly affectedSkuCount: number
  readonly flaggedCharges: number
  readonly currentFeeRate: number
  readonly previousFeeRate: number | null
  readonly feeRateChange: number | null
  readonly issues: readonly FeeAuditIssue[]
  readonly skus: readonly FeeAuditSku[]
  readonly distribution: readonly { kind: FeeIssueKind; label: string; count: number; amount: number }[]
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const labels: Record<FeeIssueKind, string> = { HIGH_FEE_SHARE: 'High fee share', FEES_EXCEED_PROFIT: 'Fees exceed order profit', SHIPPING_NOT_REVERSED: 'Shipping not reversed', PARTIAL_SHIPPING_REVERSAL: 'Partial shipping reversal', DUPLICATE_FEE: 'Possible duplicate fee', COMMISSION_RATE_CHANGE: 'Commission-rate change' }
const totalFees = (order: OrderProfitSummary) => order.marketplaceCharges + order.shippingFees + order.advertising
const feeRate = (orders: readonly OrderProfitSummary[]) => { const sales = orders.reduce((sum, order) => sum + order.grossSales, 0); return sales ? round(orders.reduce((sum, order) => sum + totalFees(order), 0) / sales * 100) : 0 }
const median = (values: readonly number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2 : 0 }
const feeFingerprint = (event: CanonicalFinancialEvent) => [event.amountType, event.rawType, event.amount, event.date ?? ''].join('\u001f')

export function buildFeeAudit(orders: readonly OrderProfitSummary[], previousOrders: readonly OrderProfitSummary[] = []): FeeAuditResult {
  const issues: FeeAuditIssue[] = []
  const commissionRates = new Map<string, number[]>()
  orders.forEach(order => order.skus.forEach(sku => { if (order.grossSales > 0 && order.commissionCharges > 0) commissionRates.set(sku, [...(commissionRates.get(sku) ?? []), order.commissionCharges / order.grossSales * 100]) }))
  const commissionBaselines = new Map([...commissionRates].map(([sku, rates]) => [sku, median(rates)]))
  const add = (order: OrderProfitSummary, kind: FeeIssueKind, amount: number, explanation: string, severity: FeeAuditIssue['severity'] = 'WARNING') => issues.push({ id: `${order.orderId}:${kind}:${issues.length}`, kind, label: labels[kind], explanation, orderId: order.orderId, skus: order.skus, amount: round(amount), severity })

  orders.forEach(order => {
    const fees = totalFees(order)
    const share = order.grossSales ? fees / order.grossSales * 100 : 0
    if (order.grossSales > 0 && share >= 35) add(order, 'HIGH_FEE_SHARE', fees, `Fees are ${round(share)}% of gross sales; the review threshold is 35%.`, share >= 60 ? 'CRITICAL' : 'WARNING')
    if (fees > 0 && order.profitReady && fees > Math.max(0, order.profit)) add(order, 'FEES_EXCEED_PROFIT', fees, `Associated fees of ${round(fees)} exceed this order's profit of ${round(order.profit)}.`, order.profit < 0 ? 'CRITICAL' : 'WARNING')
    if (order.returnQuantity > 0 && order.grossShippingFees > 0 && order.shippingFeeReversals === 0) add(order, 'SHIPPING_NOT_REVERSED', order.grossShippingFees, 'The order has a product refund and an outbound shipping charge, but no positive shipping reversal. Return type is not inferred from this warning.')
    if (order.returnQuantity > 0 && order.shippingFeeReversals > 0 && order.shippingFeeReversals + .01 < order.grossShippingFees) add(order, 'PARTIAL_SHIPPING_REVERSAL', order.grossShippingFees - order.shippingFeeReversals, `Only ${round(order.shippingFeeReversals)} of ${round(order.grossShippingFees)} shipping charges was reversed.`)
    const seen = new Set<string>()
    order.events.filter(event => event.amountClass === 'OPERATING' && event.amount < 0 && ['COMMISSION', 'FULFILLMENT_FEE', 'SHIPPING_FEE', 'OTHER_FEE'].includes(event.amountType)).forEach(event => { const fingerprint = feeFingerprint(event); if (seen.has(fingerprint)) add(order, 'DUPLICATE_FEE', -event.amount, `The same ${event.rawType || event.amountType} charge appears more than once at the same posted time.`); else seen.add(fingerprint) })
    if (order.grossSales > 0 && order.commissionCharges > 0) order.skus.forEach(sku => { const baseline = commissionBaselines.get(sku) ?? 0, rate = order.commissionCharges / order.grossSales * 100; if (commissionRates.get(sku)!.length >= 3 && Math.abs(rate - baseline) >= 5 && rate >= baseline * 1.5) add(order, 'COMMISSION_RATE_CHANGE', order.commissionCharges, `Commission is ${round(rate)}% of sales versus this SKU's ${round(baseline)}% median.`) })
  })

  const bySku = new Map<string, FeeAuditIssue[]>()
  issues.forEach(issue => issue.skus.forEach(sku => bySku.set(sku, [...(bySku.get(sku) ?? []), issue])))
  const orderById = new Map(orders.map(order => [order.orderId, order]))
  const skus = [...bySku].map(([sku, skuIssues]) => {
    const orderIds = [...new Set(skuIssues.map(issue => issue.orderId))], affected = orderIds.flatMap(id => orderById.get(id) ? [orderById.get(id)!] : [])
    const grossSales = round(affected.reduce((sum, order) => sum + order.grossSales, 0)), charges = round(affected.reduce((sum, order) => sum + totalFees(order), 0))
    return { sku, issueCount: skuIssues.length, flaggedCharges: charges, grossSales, feeShare: grossSales ? round(charges / grossSales * 100) : 0, orderIds }
  }).sort((a, b) => b.flaggedCharges - a.flaggedCharges || a.sku.localeCompare(b.sku))
  const kinds = Object.keys(labels) as FeeIssueKind[]
  const currentFeeRate = feeRate(orders), previousFeeRate = previousOrders.length ? feeRate(previousOrders) : null
  return { issueCount: issues.length, criticalCount: issues.filter(issue => issue.severity === 'CRITICAL').length, affectedOrderCount: new Set(issues.map(issue => issue.orderId)).size, affectedSkuCount: skus.length, flaggedCharges: round([...new Set(issues.map(issue => issue.orderId))].reduce((sum, id) => sum + totalFees(orderById.get(id)!), 0)), currentFeeRate, previousFeeRate, feeRateChange: previousFeeRate === null ? null : round(currentFeeRate - previousFeeRate), issues, skus, distribution: kinds.map(kind => { const items = issues.filter(issue => issue.kind === kind); return { kind, label: labels[kind], count: items.length, amount: round(items.reduce((sum, issue) => sum + issue.amount, 0)) } }).filter(item => item.count > 0) }
}
