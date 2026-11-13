import { describe, expect, it } from 'vitest'
import { buildBusinessOverview } from './businessOverview'
import type { CanonicalFinancialEvent } from '../data/types'

describe('businessOverview', () => {
  it('counts known order identities without manufacturing financial value before postings arrive', () => {
    const result = buildBusinessOverview([], [], 'BLOCK', undefined, ['A', 'B', 'A'])
    expect(result.orderCount).toBe(2)
    expect(result.summary.grossSales).toBe(0)
    expect(result.summary.marketplaceCharges).toBe(0)
    expect(result.costStatus.netCogs).toBe(0)
  })

  it('reconciles customer sales including GST and balances financial rows to operating net', () => {
    const base = { source: 'x', sourceDatasetId: 'x', sourceRow: 1, date: '2026-10-01', orderId: 'ord-1', sku: 'SKU-A', quantity: 1, amountClass: 'OPERATING' as const, state: null, city: null, status: null, rawType: '', rawDescription: null, classified: true, raw: {} }
    const events: CanonicalFinancialEvent[] = [
      { ...base, id: 'sale-prod', event: 'SALE', amount: 1000, amountType: 'PRODUCT_REVENUE' },
      { ...base, id: 'sale-tax', event: 'TAX', amount: 180, amountType: 'TAX' },
      { ...base, id: 'sale-ship', event: 'SALE', amount: 50, amountType: 'SHIPPING_REVENUE' },
      { ...base, id: 'fee-comm', event: 'FEE', amount: -150, amountType: 'COMMISSION' },
      { ...base, id: 'fee-easyship', event: 'FEE', amount: -70, amountType: 'SHIPPING_FEE' },
      { ...base, id: 'tax-tds', event: 'TAX', amount: -10, amountType: 'TAX' },
    ]

    const result = buildBusinessOverview(events, [{ sku: 'SKU-A', unitCost: 400, updatedAt: '' }], 'BLOCK')

    // Gross customer sales includes product (1000) + tax (180) + shipping (50) = 1230
    expect(result.summary.grossSales).toBe(1230)
    // Operating net = 1000 + 180 + 50 - 150 - 70 - 10 = 1000
    expect(result.summary.operatingNet).toBe(1000)
    // Profit after ads & cogs (400) = 1000 - 400 = 600
    expect(result.profitAfterAds).toBe(600)

    // Net sale (Net Amazon Payout) = gross (1230) - refunds (0) - marketplace (150) - shipping (70) + reimbursements (0) = 1010
    expect(result.netMarketplaceProceeds).toBe(1010)

    // Financial rows sum (excluding cogs) must exactly equal operatingNet
    const directRowsSum = result.financialRows
      .filter(row => row.label !== 'Product costs')
      .reduce((sum, row) => sum + (row.value ?? 0), 0)
    expect(Math.round(directRowsSum * 100) / 100).toBe(result.summary.operatingNet)
  })
})
