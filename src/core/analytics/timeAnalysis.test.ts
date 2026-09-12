import { describe, expect, it } from 'vitest'
import type { OrderProfitSummary } from './orderProfit'
import { buildOrderTimeComparison, orderTimeDimensions, parseReportTimestamp } from './timeAnalysis'

const order = (id: string, date: string, sales = 100): OrderProfitSummary => ({ orderId: id, date, skus: ['A'], state: null, city: null, accountType: null, fulfillmentType: null, status: null, grossSales: sales, soldQuantity: 1, returnQuantity: 0, refunds: 0, marketplaceCharges: 0, commissionCharges: 0, otherMarketplaceCharges: 0, shippingFees: 0, grossShippingFees: 0, shippingFeeReversals: 0, advertising: 0, reimbursements: 0, tax: 0, otherOperating: 0, operatingNet: sales, netCogs: 0, profit: sales, profitPerDeliveredUnit: sales, breakEvenTacos: 100, profitReady: true, missingSkus: [], returnType: null, returnEvidence: null, events: [{ id, source: 'test', sourceDatasetId: 'd', sourceRow: 1, date, orderId: id, sku: 'A', event: 'SALE', quantity: 1, amount: sales, amountClass: 'OPERATING', amountType: 'PRODUCT_REVENUE', state: null, city: null, status: null, rawType: '', rawDescription: null, classified: true, raw: {} }] })

describe('order time analysis', () => {
  it('parses marketplace timestamps and converts them to the reporting timezone', () => {
    expect(parseReportTimestamp('1 Aug 2026 7:30:00 pm UTC')?.toISOString()).toBe('2026-08-01T19:30:00.000Z')
    expect(orderTimeDimensions(order('1', '1 Aug 2026 7:30:00 pm UTC'))).toMatchObject({ date: '2026-08-02', time: '01:00', weekday: 'Sunday', hour: 1 })
  })
  it('compares distinct sale orders by weekday and hour without counting financial rows', () => {
    const result = buildOrderTimeComparison([order('c1', '3 Aug 2026 4:00:00 am UTC'), order('c2', '3 Aug 2026 4:15:00 am UTC')], [order('p1', '27 Jul 2026 4:00:00 am UTC')], 'ORDERS')
    expect(result.current.orders).toBe(2)
    expect(result.previous.orders).toBe(1)
    expect(result.orderChangePercent).toBe(100)
    expect(result.weekdays.find(item => item.label === 'Mon')).toMatchObject({ current: 2, previous: 1, change: 1 })
    expect(result.hours.find(item => item.key === '9')).toMatchObject({ current: 2, previous: 1 })
  })
})
