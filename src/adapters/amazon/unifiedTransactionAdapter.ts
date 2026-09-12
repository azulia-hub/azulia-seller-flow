import type { DetectionResult, SourceAdapter } from '../../core/adapters/sourceAdapter'
import type { CanonicalDataset, CanonicalFinancialEvent, RawDataset } from '../../core/data/types'
import { normalizeDataset } from '../../core/normalize/normalizeDataset'
import type { MappingSpec } from '../../core/normalize/types'

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')
export const normalizeAmazonSku = (sku: string) => sku.endsWith('-MFN') ? sku.slice(0, -4) : sku

export function classifyAmazonReturns(dataset: CanonicalDataset): CanonicalDataset {
  const ordersWithShippingReversal = new Set(dataset.events.flatMap((event) =>
    event.orderId && event.amountType === 'SHIPPING_FEE' && event.amount > 0 ? [event.orderId] : []))
  const events = dataset.events.map((event): CanonicalFinancialEvent => {
    if (event.event !== 'REFUND' || !event.orderId) return event
    const isRto = ordersWithShippingReversal.has(event.orderId)
    return {
      ...event,
      returnType: isRto ? 'RTO' : 'CUSTOMER_RETURN',
      returnEvidence: isRto
        ? 'Easy Ship handling fee reversal found for this order'
        : 'No Easy Ship handling fee reversal found for this order',
    }
  })
  return { ...dataset, events }
}

export const amazonUnifiedTransactionMapping: MappingSpec = {
  id: 'amazon-unified-transactions-v2', source: 'amazon',
  fields: {
    date: 'date/time', orderId: 'order id', sku: 'sku', quantity: 'quantity',
    state: 'order state', city: 'order city', status: 'Transaction Status',
    accountType: 'account type', fulfillmentType: 'fulfillment',
    rawType: 'type', description: 'description',
  },
  totalColumn: 'total',
  fieldTransforms: [{ field: 'sku', operation: 'stripSuffix', value: '-MFN' }],
  types: [
    { value: 'Order', event: 'SALE' }, { value: 'Refund', event: 'REFUND' },
    { value: 'Service Fee', event: 'FEE' }, { value: 'Adjustment', event: 'REIMBURSEMENT' },
    { value: 'FBA Inventory Fee', event: 'FEE' }, { value: 'Shipping Services', event: 'FEE' },
    { value: 'Transfer', event: 'SETTLEMENT', amountClass: 'SETTLEMENT' },
    { value: 'SAFE-T Reimbursement', event: 'REIMBURSEMENT' },
    { value: 'Reimbursements', event: 'REIMBURSEMENT' },
    { value: 'FBA Transaction fees', event: 'FEE' },
    { value: 'Fulfilment Fee Refund', event: 'FEE' },
    { value: 'Tax Withheld', event: 'TAX' },
    { value: 'Debt', event: 'SETTLEMENT', amountClass: 'SETTLEMENT' },
  ],
  amounts: [
    { column: 'product sales', amountType: 'PRODUCT_REVENUE', event: 'SALE' },
    { column: 'product sales tax', amountType: 'TAX', event: 'TAX' },
    { column: 'shipping credits', amountType: 'SHIPPING_REVENUE', event: 'SALE' },
    { column: 'shipping credits tax', amountType: 'TAX', event: 'TAX' },
    { column: 'gift wrap credits', amountType: 'GIFT_WRAP_REVENUE', event: 'SALE' },
    { column: 'giftwrap credits tax', amountType: 'TAX', event: 'TAX' },
    { column: 'gift wrap credits tax', amountType: 'TAX', event: 'TAX' },
    { column: 'promotional rebates', amountType: 'PROMOTION', event: 'FEE' },
    { column: 'promotional rebates tax', amountType: 'TAX', event: 'TAX' },
    { column: 'marketplace withheld tax', amountType: 'TAX', event: 'TAX' },
    { column: 'Total sales tax liable(GST before adjusting TCS)', amountType: 'TAX', event: 'TAX' },
    { column: 'TCS-CGST', amountType: 'TAX', event: 'TAX' },
    { column: 'TCS-SGST', amountType: 'TAX', event: 'TAX' },
    { column: 'TCS-IGST', amountType: 'TAX', event: 'TAX' },
    { column: 'TDS (Section 194-O)', amountType: 'TAX', event: 'TAX' },
    { column: 'selling fees', amountType: 'COMMISSION', event: 'FEE' },
    { column: 'fba fees', amountType: 'FULFILLMENT_FEE', event: 'FEE' },
    { column: 'other transaction fees', amountType: 'SHIPPING_FEE', event: 'FEE', when: { column: 'description', operator: 'contains', value: 'Easy Ship' } },
    { column: 'other transaction fees', amountType: 'ADVERTISING_FEE', event: 'FEE', when: { column: 'description', operator: 'contains', value: 'Advertising' } },
    { column: 'other transaction fees', amountType: 'OTHER_FEE', event: 'FEE' },
    { column: 'other', amountType: 'ADVERTISING_FEE', event: 'FEE', when: { column: 'description', operator: 'contains', value: 'Advertising' } },
    { column: 'other', amountType: 'OTHER', event: 'OTHER' },
  ],
}

export const amazonUnifiedTransactionAdapter: SourceAdapter = {
  id: 'amazon-unified-transactions', name: 'Amazon Unified Transaction Report',
  mapping: amazonUnifiedTransactionMapping,
  detect(input: RawDataset): DetectionResult {
    const headers = new Set(input.headers.map(normalizeHeader))
    const signatures = ['date/time', 'settlement id', 'type', 'order id', 'product sales', 'selling fees', 'total']
    const found = signatures.filter((header) => headers.has(header))
    return {
      matched: ['date/time', 'type', 'total'].every((header) => headers.has(header)) && found.length >= 5,
      confidence: found.length / signatures.length,
      reasons: found.map((header) => `Found Amazon column: ${header}`),
    }
  },
  normalize(input, mapping = amazonUnifiedTransactionMapping) { return classifyAmazonReturns(normalizeDataset(input, mapping)) },
}
