import type { AmountType, RawDataset } from '../../core/data/types'
import type { MappingSpec } from '../../core/normalize/types'

const key = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
const find = (headers: readonly string[], names: readonly string[]) =>
  headers.find((header) => names.includes(key(header)))

const nonAmountNames = new Set(['id', 'orderid', 'transactionid', 'settlementid', 'sku', 'quantity', 'qty', 'postalcode', 'pincode'])

export function numericColumns(input: RawDataset): string[] {
  return input.headers.filter((header) => {
    if (nonAmountNames.has(key(header))) return false
    const values = input.rows.slice(0, 25).map((row) => row[header]).filter((value) => String(value ?? '').trim() !== '')
    if (!values.length) return false
    return values.filter((value) => Number.isFinite(Number(String(value).trim().replace(/[₹,$£€\s]/g, '').replace(/^\((.*)\)$/, '-$1')))).length / values.length >= 0.8
  })
}

function guessedAmountType(header: string): AmountType {
  const name = key(header)
  if (name.includes('tax') || name.includes('gst')) return 'TAX'
  if (name.includes('commission')) return 'COMMISSION'
  if (name.includes('advertis') || name.includes('adspend')) return 'ADVERTISING_FEE'
  if (name.includes('shipping') && name.includes('fee')) return 'FULFILLMENT_FEE'
  if (name.includes('fee') || name.includes('charge')) return 'OTHER_FEE'
  if (name.includes('sale') || name.includes('revenue')) return 'PRODUCT_REVENUE'
  return 'UNKNOWN'
}

export function suggestGenericMapping(input: RawDataset): MappingSpec {
  const totalColumn = find(input.headers, ['total', 'nettotal', 'amounttotal'])
  const amounts = numericColumns(input).filter((column) => column !== totalColumn)
  return {
    id: `generic:${input.id}`, source: 'generic-csv',
    fields: {
      date: find(input.headers, ['date', 'datetime', 'transactiondate', 'posteddate']),
      orderId: find(input.headers, ['orderid', 'ordernumber']), sku: find(input.headers, ['sku', 'productsku']),
      quantity: find(input.headers, ['quantity', 'qty']), state: find(input.headers, ['state', 'orderstate']),
      city: find(input.headers, ['city', 'ordercity']), status: find(input.headers, ['status', 'transactionstatus']),
      rawType: find(input.headers, ['type', 'transactiontype', 'event']),
      description: find(input.headers, ['description', 'details', 'narration']),
    },
    amounts: amounts.map((column) => ({ column, amountType: guessedAmountType(column), event: 'OTHER' })),
    totalColumn,
  }
}
