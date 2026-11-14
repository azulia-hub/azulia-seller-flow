import type { CanonicalFinancialEvent, ReturnType } from '../data/types'
import type { ProductCost } from '../costs/types'
import { createProductCostResolver, type ProductCostResolver } from '../costs/calculateCosts'
import { canonicalDateKey } from './dashboardSummary'
import { calculateRecoveryCost, type ReturnInspectionRecord } from '../return-recovery'

function findReturnInspection(
  inspections: ReadonlyMap<string, ReturnInspectionRecord> | Record<string, ReturnInspectionRecord>,
  orderId: string,
  sku: string
): ReturnInspectionRecord | undefined {
  if (inspections instanceof Map) {
    for (const record of inspections.values()) {
      if (record.identity.orderId === orderId && record.identity.sku === sku) return record
    }
    return inspections.get(orderId)
  }
  for (const record of Object.values(inspections)) {
    if (record?.identity?.orderId === orderId && record?.identity?.sku === sku) return record
  }
  return (inspections as Record<string, ReturnInspectionRecord>)[orderId]
}

export interface ReturnOrderSummary {
  readonly orderId: string
  readonly date: string | null
  readonly sku: string | null
  readonly state: string | null
  readonly city: string | null
  readonly type: ReturnType
  readonly quantity: number
  readonly refundValue: number
  readonly netShipping: number
  readonly marketplaceCharges: number
  readonly evidence: string
  readonly reimbursements: number
  readonly cogsRecovered: number
  readonly repairExpense?: number
  readonly returnLossBeforeReimbursement: number
  readonly returnLossAfterReimbursement: number
  readonly missingCost: boolean
}

export interface SkuReturnSummary {
  readonly sku: string
  readonly soldQuantity: number
  readonly returnedQuantity: number
  readonly returnRate: number
  readonly rtoQuantity: number
  readonly rtoRate: number
  readonly rtoShare: number
  readonly customerReturnQuantity: number
  readonly customerReturnRate: number
  readonly customerReturnShare: number
  readonly unknownQuantity: number
  readonly unknownShare: number
  readonly refundValue: number
  readonly reimbursements: number
  readonly cogsRecovered: number
  readonly returnLoss: number
  readonly netShipping: number
  readonly marketplaceCharges: number
  readonly reliability: 'LOW' | 'MEDIUM' | 'HIGH'
}

export interface ReturnTrendPoint {
  readonly period: string
  readonly soldQuantity: number
  readonly returnedQuantity: number
  readonly rtoQuantity: number
  readonly customerReturnQuantity: number
  readonly returnRate: number
  readonly rtoRate: number
  readonly customerReturnRate: number
}

export interface SkuReturnFilterSpec {
  readonly search?: string
  readonly type?: ReturnType | 'ALL'
  readonly minimumReturnRate?: number
  readonly minimumReturnedQuantity?: number
  readonly sort?: 'RETURN_RATE' | 'RETURNED_UNITS' | 'REFUND_VALUE' | 'RETURN_LOSS'
  readonly direction?: 'ASC' | 'DESC'
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const chargeTypes = new Set(['COMMISSION', 'FULFILLMENT_FEE', 'OTHER_FEE'])

function trendPeriod(date: string, grain: 'DAY' | 'WEEK') {
  if (grain === 'DAY') return date
  const parsed = new Date(`${date}T00:00:00Z`)
  const day = parsed.getUTCDay() || 7
  parsed.setUTCDate(parsed.getUTCDate() - day + 1)
  return parsed.toISOString().slice(0, 10)
}

export function buildReturnTrend(events: readonly CanonicalFinancialEvent[], grain: 'DAY' | 'WEEK'): ReturnTrendPoint[] {
  const periods = new Map<string, CanonicalFinancialEvent[]>()
  events.forEach((event) => {
    const date = canonicalDateKey(event.date)
    if (!date) return
    const period = trendPeriod(date, grain)
    periods.set(period, [...(periods.get(period) ?? []), event])
  })
  return [...periods].map(([period, items]) => {
    const product = items.filter((event) => event.amountType === 'PRODUCT_REVENUE')
    const sold = product.filter((event) => event.event === 'SALE' && event.amount > 0).reduce((sum, event) => sum + (event.quantity ?? 0), 0)
    const returned = product.filter((event) => event.event === 'REFUND' && event.amount < 0)
    const returnedQty = returned.reduce((sum, event) => sum + (event.quantity ?? 0), 0)
    const typeQty = (type: ReturnType) => returned.filter((event) => (event.returnType ?? 'UNKNOWN') === type).reduce((sum, event) => sum + (event.quantity ?? 0), 0)
    const rto = typeQty('RTO'), customer = typeQty('CUSTOMER_RETURN')
    return { period, soldQuantity: sold, returnedQuantity: returnedQty, rtoQuantity: rto, customerReturnQuantity: customer, returnRate: sold ? round(returnedQty / sold * 100) : 0, rtoRate: sold ? round(rto / sold * 100) : 0, customerReturnRate: sold ? round(customer / sold * 100) : 0 }
  }).sort((a, b) => a.period.localeCompare(b.period))
}

export function filterSkuReturns(items: readonly SkuReturnSummary[], spec: SkuReturnFilterSpec): SkuReturnSummary[] {
  const search = spec.search?.trim().toLocaleLowerCase()
  const filtered = items.filter((item) => {
    if (search && !item.sku.toLocaleLowerCase().includes(search)) return false
    if ((spec.minimumReturnRate ?? 0) > item.returnRate) return false
    if ((spec.minimumReturnedQuantity ?? 0) > item.returnedQuantity) return false
    if (spec.type === 'RTO' && item.rtoQuantity === 0) return false
    if (spec.type === 'CUSTOMER_RETURN' && item.customerReturnQuantity === 0) return false
    if (spec.type === 'UNKNOWN' && item.unknownQuantity === 0) return false
    return true
  })
  const key = spec.sort ?? 'RETURN_RATE'
  const value = (item: SkuReturnSummary) => key === 'RETURNED_UNITS' ? item.returnedQuantity : key === 'REFUND_VALUE' ? item.refundValue : key === 'RETURN_LOSS' ? item.returnLoss : item.returnRate
  const direction = spec.direction === 'ASC' ? 1 : -1
  return [...filtered].sort((a, b) => direction * (value(a) - value(b)) || a.sku.localeCompare(b.sku))
}

export function summarizeReturns(
  events: readonly CanonicalFinancialEvent[],
  costs: readonly ProductCost[] = [],
  normalizeSku: (sku: string) => string = (sku) => sku,
  resolveCost: ProductCostResolver = createProductCostResolver(costs, normalizeSku),
  inspections?: ReadonlyMap<string, ReturnInspectionRecord> | Record<string, ReturnInspectionRecord>
) {
  const refundEvents = events.filter((event) => event.event === 'REFUND' && event.amountType === 'PRODUCT_REVENUE' && event.amount < 0)
  const byOrder = new Map<string, CanonicalFinancialEvent[]>()
  events.forEach((event) => { if (event.orderId) { const group = byOrder.get(event.orderId); if (group) group.push(event); else byOrder.set(event.orderId, [event]) } })
  const refundGroups = new Map<string, CanonicalFinancialEvent[]>()
  refundEvents.forEach((refund) => {
    const key = refund.orderId ?? `Unassigned row ${refund.sourceRow}`
    refundGroups.set(key, [...(refundGroups.get(key) ?? []), refund])
  })
  const orders: ReturnOrderSummary[] = [...refundGroups].map(([orderId, refunds]) => {
    const refund = refunds[0]
    const related = refund.orderId ? byOrder.get(refund.orderId) ?? refunds : refunds
    const refundRows = new Set(refunds.map((event) => event.sourceRow))
    const returnSideEvents = related.filter((event) => event.amountClass === 'OPERATING' && (refundRows.has(event.sourceRow) || (event.amountType === 'SHIPPING_FEE' && event.amount > 0) || event.event === 'REIMBURSEMENT'))
    const reimbursements = round(returnSideEvents.filter((event) => event.event === 'REIMBURSEMENT').reduce((sum, event) => sum + event.amount, 0))
    const beforeReimbursement = round(returnSideEvents.filter((event) => event.event !== 'REIMBURSEMENT').reduce((sum, event) => sum + event.amount, 0))
    let missingCost = false
    let totalRepairExpense = 0
    const cogsRecovered = round(refunds.reduce((sum, event) => {
      if (!event.sku) { missingCost = true; return sum }
      const saleDate = canonicalDateKey(related.find(item => item.event === 'SALE' && item.amountType === 'PRODUCT_REVENUE' && item.sku === event.sku)?.date ?? null)
      const cost = resolveCost(event.sku, saleDate ?? canonicalDateKey(event.date))
      if (!cost) { missingCost = true; return sum }
      const returnedQty = event.quantity ?? 0

      if (inspections) {
        const inspection = findReturnInspection(inspections, refund.orderId ?? orderId, event.sku)
        if (inspection) {
          const recovery = calculateRecoveryCost({
            identity: inspection.identity,
            returnedQuantity: returnedQty,
            unitCost: cost.unitCost,
            inspection,
          })
          totalRepairExpense += recovery.totalRepairExpense
          return sum + recovery.confirmedRecoveredCost
        }
        // Uninspected/provisional return retains consumed cost; 0 confirmed recovered COGS
        return sum
      }

      return sum + cost.unitCost * returnedQty
    }, 0))
    const locationEvents = [...refunds, ...related]
    return {
      orderId,
      date: refund.date,
      sku: [...new Set(refunds.flatMap((event) => event.sku ? [event.sku] : []))].join(', ') || null,
      state: locationEvents.find((event) => event.state)?.state ?? null,
      city: locationEvents.find((event) => event.city)?.city ?? null,
      type: refund.returnType ?? 'UNKNOWN',
      quantity: refunds.reduce((sum, event) => sum + (event.quantity ?? 0), 0),
      refundValue: round(-refunds.reduce((sum, event) => sum + event.amount, 0)),
      netShipping: round(returnSideEvents.filter((event) => event.amountType === 'SHIPPING_FEE').reduce((sum, event) => sum + event.amount, 0)),
      marketplaceCharges: round(returnSideEvents.filter((event) => chargeTypes.has(event.amountType)).reduce((sum, event) => sum + event.amount, 0)),
      evidence: refund.returnEvidence ?? 'Source adapter did not provide return classification evidence',
      reimbursements,
      cogsRecovered,
      repairExpense: inspections ? round(totalRepairExpense) : undefined,
      returnLossBeforeReimbursement: round(Math.max(0, -(beforeReimbursement + cogsRecovered - totalRepairExpense))),
      returnLossAfterReimbursement: round(Math.max(0, -(beforeReimbursement + reimbursements + cogsRecovered - totalRepairExpense))),
      missingCost,
    }
  }).sort((a, b) => (canonicalDateKey(b.date) ?? '').localeCompare(canonicalDateKey(a.date) ?? ''))
  const quantity = (type: ReturnType) => orders.filter((order) => order.type === type).reduce((sum, order) => sum + order.quantity, 0)
  const value = (type: ReturnType) => round(orders.filter((order) => order.type === type).reduce((sum, order) => sum + order.refundValue, 0))
  const totalQuantity = orders.reduce((sum, order) => sum + order.quantity, 0)
  const soldQuantity = events.filter((event) => event.event === 'SALE' && event.amountType === 'PRODUCT_REVENUE' && event.amount > 0).reduce((sum, event) => sum + (event.quantity ?? 0), 0)
  const returnedOrderIds = new Set(orders.map((order) => order.orderId))
  const saleOrderIds = new Set(events.flatMap((event) => event.event === 'SALE' && event.amountType === 'PRODUCT_REVENUE' && event.orderId ? [event.orderId] : []))
  const productSkus = [...new Set(events.flatMap((event) => event.sku && event.amountType === 'PRODUCT_REVENUE' ? [event.sku] : []))]
  const skuSummaries: SkuReturnSummary[] = productSkus.map((sku) => {
    const skuProduct = events.filter((event) => event.sku === sku && event.amountType === 'PRODUCT_REVENUE')
    const sold = skuProduct.filter((event) => event.event === 'SALE' && event.amount > 0).reduce((sum, event) => sum + (event.quantity ?? 0), 0)
    const returned = skuProduct.filter((event) => event.event === 'REFUND' && event.amount < 0)
    const returnedQty = returned.reduce((sum, event) => sum + (event.quantity ?? 0), 0)
    const typeQty = (type: ReturnType) => returned.filter((event) => (event.returnType ?? 'UNKNOWN') === type).reduce((sum, event) => sum + (event.quantity ?? 0), 0)
    const rto = typeQty('RTO'), customer = typeQty('CUSTOMER_RETURN'), unknown = typeQty('UNKNOWN')
    const skuOrders = orders.filter((order) => order.sku?.split(', ').includes(sku))
    const allocated = (field: 'reimbursements' | 'returnLossAfterReimbursement' | 'netShipping' | 'marketplaceCharges') => round(skuOrders.reduce((sum, order) => {
      const orderRefunds = refundGroups.get(order.orderId) ?? []
      const total = orderRefunds.reduce((value, event) => value + Math.abs(event.amount), 0)
      const skuValue = orderRefunds.filter((event) => event.sku === sku).reduce((value, event) => value + Math.abs(event.amount), 0)
      return sum + order[field] * (total ? skuValue / total : 0)
    }, 0))
    let skuMissingCost = false
    const skuCogsRecovered = round(returned.reduce((sum, event) => {
      const related = event.orderId ? byOrder.get(event.orderId) ?? [] : []
      const saleDate = canonicalDateKey(related.find((item) => item.event === 'SALE' && item.amountType === 'PRODUCT_REVENUE' && item.sku === sku)?.date ?? null)
      const cost = resolveCost(sku, saleDate ?? canonicalDateKey(event.date))
      if (!cost) { skuMissingCost = true; return sum }
      const returnedQty = event.quantity ?? 0

      if (inspections && event.orderId) {
        const inspection = findReturnInspection(inspections, event.orderId, sku)
        if (inspection) {
          const recovery = calculateRecoveryCost({
            identity: inspection.identity,
            returnedQuantity: returnedQty,
            unitCost: cost.unitCost,
            inspection,
          })
          return sum + recovery.confirmedRecoveredCost
        }
        return sum
      }

      return sum + cost.unitCost * returnedQty
    }, 0))
    const reliability: SkuReturnSummary['reliability'] = sold < 10 || skuMissingCost ? 'LOW' : sold < 30 ? 'MEDIUM' : 'HIGH'
    return {
      sku, soldQuantity: sold, returnedQuantity: returnedQty,
      returnRate: sold ? round(returnedQty / sold * 100) : 0,
      rtoQuantity: rto, rtoRate: sold ? round(rto / sold * 100) : 0, rtoShare: returnedQty ? round(rto / returnedQty * 100) : 0,
      customerReturnQuantity: customer, customerReturnRate: sold ? round(customer / sold * 100) : 0, customerReturnShare: returnedQty ? round(customer / returnedQty * 100) : 0,
      unknownQuantity: unknown, unknownShare: returnedQty ? round(unknown / returnedQty * 100) : 0,
      refundValue: round(-returned.reduce((sum, event) => sum + event.amount, 0)),
      reimbursements: allocated('reimbursements'),
      cogsRecovered: skuCogsRecovered,
      returnLoss: allocated('returnLossAfterReimbursement'),
      netShipping: allocated('netShipping'),
      marketplaceCharges: allocated('marketplaceCharges'),
      reliability,
    }
  }).filter((item) => item.returnedQuantity > 0).sort((a, b) => b.returnRate - a.returnRate || b.returnedQuantity - a.returnedQuantity || a.sku.localeCompare(b.sku))
  return {
    totalQuantity,
    totalRefundValue: round(orders.reduce((sum, order) => sum + order.refundValue, 0)),
    rtoQuantity: quantity('RTO'), customerReturnQuantity: quantity('CUSTOMER_RETURN'), unknownQuantity: quantity('UNKNOWN'),
    rtoValue: value('RTO'), customerReturnValue: value('CUSTOMER_RETURN'), unknownValue: value('UNKNOWN'),
    rtoShare: totalQuantity ? round(quantity('RTO') / totalQuantity * 100) : 0,
    customerReturnShare: totalQuantity ? round(quantity('CUSTOMER_RETURN') / totalQuantity * 100) : 0,
    unknownShare: totalQuantity ? round(quantity('UNKNOWN') / totalQuantity * 100) : 0,
    returnRate: soldQuantity ? totalQuantity / soldQuantity * 100 : 0,
    rtoRate: soldQuantity ? quantity('RTO') / soldQuantity * 100 : 0,
    returnedOrderRate: saleOrderIds.size ? returnedOrderIds.size / saleOrderIds.size * 100 : 0,
    netShipping: round(orders.reduce((sum, order) => sum + order.netShipping, 0)),
    marketplaceCharges: round(orders.reduce((sum, order) => sum + order.marketplaceCharges, 0)),
    reimbursements: round(orders.reduce((sum, order) => sum + order.reimbursements, 0)),
    cogsRecovered: round(orders.reduce((sum, order) => sum + order.cogsRecovered, 0)),
    totalRepairExpense: round(orders.reduce((sum, order) => sum + (order.repairExpense ?? 0), 0)),
    returnLossBeforeReimbursement: round(orders.reduce((sum, order) => sum + order.returnLossBeforeReimbursement, 0)),
    returnLossAfterReimbursement: round(orders.reduce((sum, order) => sum + order.returnLossAfterReimbursement, 0)),
    rtoLoss: round(orders.filter((order) => order.type === 'RTO').reduce((sum, order) => sum + order.returnLossAfterReimbursement, 0)),
    customerReturnLoss: round(orders.filter((order) => order.type === 'CUSTOMER_RETURN').reduce((sum, order) => sum + order.returnLossAfterReimbursement, 0)),
    unknownReturnLoss: round(orders.filter((order) => order.type === 'UNKNOWN').reduce((sum, order) => sum + order.returnLossAfterReimbursement, 0)),
    missingCostOrderCount: orders.filter((order) => order.missingCost).length,
    classificationCoverage: totalQuantity ? round((totalQuantity - quantity('UNKNOWN')) / totalQuantity * 100) : 100,
    dateCoverage: (() => { const dates = events.flatMap((event) => { const date = canonicalDateKey(event.date); return date ? [date] : [] }).sort(); return { from: dates[0] ?? null, to: dates.at(-1) ?? null } })(),
    dailyTrend: buildReturnTrend(events, 'DAY'), weeklyTrend: buildReturnTrend(events, 'WEEK'),
    orders, skuSummaries,
    chartSkus: [...skuSummaries].sort((a, b) => b.returnedQuantity - a.returnedQuantity || b.returnRate - a.returnRate).slice(0, 8),
  }
}
