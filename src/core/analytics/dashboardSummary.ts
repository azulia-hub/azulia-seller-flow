import type { CanonicalFinancialEvent } from '../data/types'

export interface DashboardFilters {
  readonly sku?: string
  readonly state?: string
  readonly fromDate?: string
  readonly toDate?: string
  readonly fulfillmentType?: string
}

export interface ProductSummary {
  readonly sku: string
  readonly grossSales: number
  readonly netRevenue: number
  readonly soldQuantity: number
  readonly returnQuantity: number
  readonly operatingNet: number
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)
const rounded = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const months: Readonly<Record<string, string>> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12',
}

export function canonicalDateKey(value: string | null): string | null {
  if (!value) return null
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const named = value.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/)
  if (!named) return null
  const month = months[named[2].toLowerCase()]
  return month ? `${named[3]}-${month}-${named[1].padStart(2, '0')}` : null
}

export function filterEvents(events: readonly CanonicalFinancialEvent[], filters: DashboardFilters) {
  return events.filter((event) => {
    if (filters.sku && event.sku !== filters.sku) return false
    if (filters.state && event.state !== filters.state) return false
    if (filters.fulfillmentType && event.fulfillmentType && event.fulfillmentType !== filters.fulfillmentType) return false
    if (!filters.fromDate && !filters.toDate) return true
    const date = canonicalDateKey(event.date)
    if (!date) return false
    if (filters.fromDate && date < filters.fromDate) return false
    if (filters.toDate && date > filters.toDate) return false
    return true
  })
}

export function summarizeDashboard(events: readonly CanonicalFinancialEvent[]) {
  const product = events.filter((event) => event.amountType === 'PRODUCT_REVENUE')
  const sales = product.filter((event) => event.event === 'SALE' && event.amount > 0)
  const refunds = product.filter((event) => event.event === 'REFUND' || event.amount < 0)
  const grossSales = rounded(sum(sales.map((event) => event.amount)))
  const netProductRevenue = rounded(sum(product.map((event) => event.amount)))
  const refundValue = rounded(-sum(refunds.map((event) => event.amount)))
  const soldQuantity = sum(sales.map((event) => event.quantity ?? 0))
  const returnQuantity = sum(refunds.map((event) => event.quantity ?? 0))
  const operatingNet = rounded(sum(events.filter((event) => event.amountClass === 'OPERATING').map((event) => event.amount)))
  const adsSpend = rounded(-sum(events.filter((event) => event.amountClass === 'OPERATING' && event.amountType === 'ADVERTISING_FEE').map((event) => event.amount)))
  const netEasyShipFee = rounded(-sum(events.filter((event) => event.amountClass === 'OPERATING' && event.amountType === 'SHIPPING_FEE').map((event) => event.amount)))
  const marketplaceChargeTypes = new Set(['COMMISSION', 'FULFILLMENT_FEE', 'OTHER_FEE'])
  const marketplaceCharges = rounded(-sum(events.filter((event) => event.amountClass === 'OPERATING' && marketplaceChargeTypes.has(event.amountType)).map((event) => event.amount)))
  const reimbursements = rounded(sum(events.filter((event) => event.amountClass === 'OPERATING' && event.event === 'REIMBURSEMENT').map((event) => event.amount)))
  const taxNet = rounded(sum(events.filter((event) => event.amountClass === 'OPERATING' && event.amountType === 'TAX').map((event) => event.amount)))
  const unclassifiedAmount = rounded(sum(events.filter((event) => event.amountClass === 'OPERATING' && !event.classified).map((event) => event.amount)))
  return {
    grossSales, netProductRevenue, soldQuantity, returnQuantity, operatingNet, adsSpend,
    tacos: grossSales ? adsSpend / grossSales * 100 : 0,
    averageSellingPrice: soldQuantity ? grossSales / soldQuantity : 0,
    reimbursements, netEasyShipFee, marketplaceCharges, refundValue, taxNet, unclassifiedAmount,
    netDeliveredQuantity: soldQuantity - returnQuantity,
    roas: adsSpend ? grossSales / adsSpend : 0,
    returnRate: soldQuantity ? returnQuantity / soldQuantity * 100 : 0,
  }
}

export function summarizeProducts(events: readonly CanonicalFinancialEvent[]): ProductSummary[] {
  const bySku = new Map<string, CanonicalFinancialEvent[]>()
  events.forEach((event) => { if (event.sku) bySku.set(event.sku, [...(bySku.get(event.sku) ?? []), event]) })
  return [...bySku].map(([sku, items]) => {
    const summary = summarizeDashboard(items)
    return { sku, grossSales: summary.grossSales, netRevenue: summary.netProductRevenue, soldQuantity: summary.soldQuantity, returnQuantity: summary.returnQuantity, operatingNet: summary.operatingNet }
  }).sort((a, b) => b.grossSales - a.grossSales)
}

export function dailySales(events: readonly CanonicalFinancialEvent[]) {
  const totals = new Map<string, number>()
  events.filter((event) => event.event === 'SALE' && event.amountType === 'PRODUCT_REVENUE' && event.amount > 0).forEach((event) => {
    const label = event.date?.replace(/\s+\d{1,2}:\d{2}:\d{2}.*$/, '') ?? 'Unknown date'
    totals.set(label, (totals.get(label) ?? 0) + event.amount)
  })
  return [...totals].map(([label, value]) => ({ label, value: rounded(value) }))
}
