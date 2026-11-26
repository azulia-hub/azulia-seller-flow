import { expect, it } from 'vitest'
import type { CanonicalFinancialEvent } from '../data/types'
import { missingCostQueue } from './missingCostQueue'

const sale: CanonicalFinancialEvent = {
  id: 'sale', orderId: 'order', sku: 'A', date: '2026-11-20', event: 'SALE', amountType: 'PRODUCT_REVENUE',
  amount: 1000, amountClass: 'OPERATING', quantity: 10, source: 'test', sourceDatasetId: 'test', sourceRow: 1,
  state: null, city: null, status: null, rawType: 'sale', rawDescription: null, classified: true, raw: {},
}

it('ranks only missing SKUs by recent sales and keeps SKUs with no recent units', () => {
  expect(missingCostQueue([
    sale, { ...sale, sku: 'B', orderPurchaseDate: '2026-09-01', quantity: 40 },
    { ...sale, sku: 'C', quantity: 20 }, { ...sale, sku: 'B', quantity: 20, event: 'REFUND' },
  ], ['A', 'B'])).toEqual([{ sku: 'A', units: 10 }, { sku: 'B', units: 0 }])
})
