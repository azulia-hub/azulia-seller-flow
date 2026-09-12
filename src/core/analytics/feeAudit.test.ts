import { describe, expect, it } from 'vitest'
import type { OrderProfitSummary } from './orderProfit'
import { buildFeeAudit } from './feeAudit'

const order = (overrides: Partial<OrderProfitSummary> = {}): OrderProfitSummary => ({ orderId: 'o1', date: '2026-08-01', skus: ['SKU'], state: null, city: null, accountType: null, fulfillmentType: null, status: 'Released', grossSales: 100, soldQuantity: 1, returnQuantity: 0, refunds: 0, marketplaceCharges: 15, commissionCharges: 10, otherMarketplaceCharges: 5, shippingFees: 10, grossShippingFees: 10, shippingFeeReversals: 0, advertising: 0, reimbursements: 0, tax: 0, otherOperating: 0, operatingNet: 75, netCogs: 40, profit: 35, profitPerDeliveredUnit: 35, breakEvenTacos: 35, profitReady: true, missingSkus: [], returnType: null, returnEvidence: null, events: [], ...overrides })

describe('buildFeeAudit', () => {
  it('flags high fee share and missing shipping reversal without inferring RTO', () => {
    const result = buildFeeAudit([order({ marketplaceCharges: 30, shippingFees: 20, grossShippingFees: 20, returnQuantity: 1, refunds: 100, profit: -50 })])
    expect(result.issues.map(issue => issue.kind)).toEqual(expect.arrayContaining(['HIGH_FEE_SHARE', 'FEES_EXCEED_PROFIT', 'SHIPPING_NOT_REVERSED']))
    expect(result.issues.find(issue => issue.kind === 'SHIPPING_NOT_REVERSED')?.explanation).toContain('not inferred')
  })

  it('reports current versus previous fee-rate movement', () => {
    const result = buildFeeAudit([order({ marketplaceCharges: 20 })], [order({ marketplaceCharges: 10, shippingFees: 5 })])
    expect(result.currentFeeRate).toBe(30)
    expect(result.previousFeeRate).toBe(15)
    expect(result.feeRateChange).toBe(15)
  })
})
