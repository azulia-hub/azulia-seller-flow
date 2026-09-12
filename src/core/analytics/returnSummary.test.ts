import { describe, expect, it } from 'vitest'
import type { CanonicalFinancialEvent } from '../data/types'
import { buildReturnTrend, filterSkuReturns, summarizeReturns } from './returnSummary'

const base = { source: 'x', sourceDatasetId: 'd', sourceRow: 1, date: '1 Aug 2026', sku: 'A', quantity: 1, amountClass: 'OPERATING' as const, state: null, city: null, status: null, rawType: '', rawDescription: null, classified: true, raw: {} }
const events: CanonicalFinancialEvent[] = [
  { ...base, sourceRow: 1, city: 'Old city', state: 'Old state', id: 'sale1', orderId: '1', event: 'SALE', amount: 100, amountType: 'PRODUCT_REVENUE' },
  { ...base, sourceRow: 2, city: 'Pune', state: 'Maharashtra', id: 'refund1', orderId: '1', event: 'REFUND', amount: -100, amountType: 'PRODUCT_REVENUE', returnType: 'RTO', returnEvidence: 'reversal' },
  { ...base, sourceRow: 3, id: 'reverse1', orderId: '1', event: 'FEE', quantity: null, amount: 20, amountType: 'SHIPPING_FEE' },
  { ...base, sourceRow: 4, id: 'sale2', orderId: '2', event: 'SALE', amount: 200, amountType: 'PRODUCT_REVENUE' },
  { ...base, sourceRow: 5, id: 'refund2', orderId: '2', event: 'REFUND', amount: -200, amountType: 'PRODUCT_REVENUE', returnType: 'CUSTOMER_RETURN' },
  { ...base, sourceRow: 5, id: 'fee2', orderId: '2', event: 'FEE', quantity: null, amount: -10, amountType: 'COMMISSION' },
  { ...base, sourceRow: 6, id: 'reimbursement2', orderId: '2', event: 'REIMBURSEMENT', quantity: null, amount: 50, amountType: 'OTHER' },
]

describe('return summary', () => {
  it('separates adapter-classified RTO and customer returns with related charges', () => {
    const summary = summarizeReturns(events, [{ sku: 'A', unitCost: 40, updatedAt: '' }])
    expect(summary).toMatchObject({ totalQuantity: 2, rtoQuantity: 1, customerReturnQuantity: 1, rtoValue: 100, customerReturnValue: 200, rtoShare: 50, customerReturnShare: 50, returnRate: 100, rtoRate: 50, returnedOrderRate: 100, netShipping: 20, marketplaceCharges: -10, cogsRecovered: 80, reimbursements: 50, returnLossBeforeReimbursement: 210, returnLossAfterReimbursement: 160, rtoLoss: 40, customerReturnLoss: 120 })
    expect(summary.skuSummaries[0]).toMatchObject({ sku: 'A', soldQuantity: 2, returnedQuantity: 2, returnRate: 100, rtoQuantity: 1, customerReturnQuantity: 1, refundValue: 300, cogsRecovered: 80, reimbursements: 50, returnLoss: 160 })
    expect(summary.orders.find((order) => order.orderId === '1')).toMatchObject({ city: 'Pune', state: 'Maharashtra' })
  })

  it('keeps unit rate separate from returned-order rate', () => {
    const multiUnitSale = events.map((event) => event.id === 'sale2' ? { ...event, quantity: 3 } : event)
    expect(summarizeReturns(multiUnitSale)).toMatchObject({ returnRate: 50, rtoRate: 25, returnedOrderRate: 100 })
  })

  it('builds trends and applies reusable SKU filters', () => {
    expect(buildReturnTrend(events, 'DAY')[0]).toMatchObject({ period: '2026-08-01', soldQuantity: 2, returnedQuantity: 2, rtoQuantity: 1, customerReturnQuantity: 1 })
    const skus = summarizeReturns(events).skuSummaries
    expect(filterSkuReturns(skus, { search: 'a', type: 'RTO', minimumReturnRate: 50 })).toHaveLength(1)
    expect(filterSkuReturns(skus, { type: 'UNKNOWN' })).toHaveLength(0)
  })
})
