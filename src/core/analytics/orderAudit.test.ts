import { describe, expect, it } from 'vitest'
import type { OrderProfitSummary } from './orderProfit'
import { buildOrderAudit } from './orderAudit'

const event = (id: string, sourceRow: number, amount: number, amountType: 'PRODUCT_REVENUE' | 'SHIPPING_FEE') => ({ id, source: 'test', sourceDatasetId: 'd', sourceRow, date: `2026-08-0${sourceRow}T00:00:00Z`, orderId: 'o1', sku: 'A', event: amount > 0 ? 'SALE' as const : 'FEE' as const, quantity: 1, amount, amountClass: 'OPERATING' as const, amountType, state: null, city: null, status: null, rawType: amountType, rawDescription: null, classified: true, raw: {} })
const order = { orderId: 'o1', date: '2026-08-01T00:00:00Z', skus: ['A'], grossSales: 100, refunds: 0, tax: 18, shippingFees: 10, grossShippingFees: 10, shippingFeeReversals: 0, commissionCharges: 5, otherMarketplaceCharges: 0, reimbursements: 0, otherOperating: 0, netCogs: 30, advertising: 0, profit: 73, profitReady: true, missingSkus: [], soldQuantity: 1, returnQuantity: 0, marketplaceCharges: 5, operatingNet: 103, events: [event('fee', 2, -10, 'SHIPPING_FEE'), event('sale', 1, 100, 'PRODUCT_REVENUE')] } as unknown as OrderProfitSummary

describe('order audit', () => {
  it('sorts source events and calculates an operating running balance', () => {
    const result = buildOrderAudit(order)
    expect(result.timeline.map(item => item.id)).toEqual(['sale', 'fee'])
    expect(result.timeline.map(item => item.runningBalance)).toEqual([100, 90])
    expect(result.feeGroups).toContainEqual({ label: 'Easy Ship charges', value: 10 })
  })
})
