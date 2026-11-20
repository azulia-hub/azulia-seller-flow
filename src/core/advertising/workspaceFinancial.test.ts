import { expect, it } from 'vitest'
import type { CanonicalFinancialEvent } from '../data/types'
import type { SkuProfitSummary } from '../analytics/orderProfit'
import { financialProductsForAdvertising } from './workspaceFinancial'

it('uses principal before separately reported GST/refunds and restores only already-booked SKU ads', () => {
  const events = [{ sku: 'sku', event: 'SALE', amountType: 'PRODUCT_REVENUE', amount: 1000 }, { sku: 'sku', event: 'TAX', amountType: 'TAX', amount: 180 }, { sku: 'sku', event: 'SALE', amountType: 'SHIPPING_REVENUE', amount: 50 }, { sku: 'sku', event: 'REFUND', amountType: 'PRODUCT_REVENUE', amount: -500 }, { sku: 'sku', event: 'SETTLEMENT', amountType: 'OTHER', amount: 9999 }] as unknown as CanonicalFinancialEvent[]
  const products = [{ sku: 'sku', profit: 100, advertising: 20, profitReady: true, missingCost: false }] as SkuProfitSummary[]
  expect(financialProductsForAdvertising(events, products)).toEqual([{ productId: 'sku', totalProductSales: 1000, contributionBeforeReportedAds: 120, completeCosts: true }])
  expect(financialProductsForAdvertising(events, [{ ...products[0], missingCost: true }])[0].contributionBeforeReportedAds).toBeNull()
})
