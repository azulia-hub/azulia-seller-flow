import { describe, expect, it } from 'vitest'
import type { CanonicalFinancialEvent } from '../data/types'
import { filterProductProfitability, filterSkuOrders, summarizeOrderGeography, summarizeOrders, summarizeProductPortfolio, summarizeProductProfitability, summarizeSkuProfit } from './orderProfit'
import { buildMetricSkuDrilldown } from './metricDrilldown'
import { buildSkuWorkspace, filterSkuWorkspaceOrders } from './skuWorkspace'

const base = { source: 'test', sourceDatasetId: 'd', sourceRow: 1, date: '1 Aug 2026', orderId: 'ORDER-1', sku: 'SKU-1', quantity: 1, amountClass: 'OPERATING' as const, state: 'Delhi', city: null, status: 'Released', rawType: '', rawDescription: null, classified: true, raw: {} }
const events: CanonicalFinancialEvent[] = [
  { ...base, id: 'sale', event: 'SALE', amount: 100, amountType: 'PRODUCT_REVENUE' },
  { ...base, id: 'commission', event: 'FEE', quantity: null, amount: -10, amountType: 'COMMISSION' },
  { ...base, id: 'ship', event: 'FEE', quantity: null, amount: -15, amountType: 'SHIPPING_FEE' },
  { ...base, id: 'ship-reversal', event: 'FEE', quantity: null, amount: 5, amountType: 'SHIPPING_FEE' },
  { ...base, id: 'tax', event: 'TAX', quantity: null, amount: 18, amountType: 'TAX' },
  { ...base, id: 'settlement', event: 'SETTLEMENT', quantity: null, amount: -93, amountClass: 'SETTLEMENT', amountType: 'OTHER' },
]

describe('order profit summary', () => {
  it('includes all operating components, nets shipping reversals, and excludes settlements', () => {
    const [order] = summarizeOrders(events, [{ sku: 'SKU-1', unitCost: 40, updatedAt: '' }], 'BLOCK')
    expect(order).toMatchObject({ grossSales: 100, marketplaceCharges: 10, shippingFees: 10, tax: 18, operatingNet: 98, netCogs: 40, profit: 58, profitPerDeliveredUnit: 58, breakEvenTacos: 58, profitReady: true, returnType: null })
  })

  it('reverses COGS for a returned resellable item', () => {
    const refund = { ...base, id: 'refund', event: 'REFUND' as const, amount: -100, amountType: 'PRODUCT_REVENUE' as const }
    const [order] = summarizeOrders([...events, refund], [{ sku: 'SKU-1', unitCost: 40, updatedAt: '' }], 'BLOCK')
    expect(order.netCogs).toBe(0)
  })

  it('keeps missing costs explicit under assume-zero policy', () => {
    const [order] = summarizeOrders(events, [], 'ASSUME_ZERO')
    expect(order).toMatchObject({ profitReady: true, netCogs: 0, missingSkus: ['SKU-1'] })
  })

  it('scopes SKU metrics and orders before calculating profit', () => {
    const otherSku = { ...base, id: 'other-sku', sku: 'SKU-2', event: 'SALE' as const, amount: 200, amountType: 'PRODUCT_REVENUE' as const }
    const result = summarizeSkuProfit([...events, otherSku], 'SKU-1', [{ sku: 'SKU-1', unitCost: 40, updatedAt: '' }], 'BLOCK')
    expect(result).toMatchObject({ sku: 'SKU-1', grossSales: 100, netDeliveredQuantity: 1, profit: 58, profitMargin: 58, profitPerDeliveredUnit: 58, breakEvenTacos: 58 })
    expect(result.orders[0].grossSales).toBe(100)
  })

  it('attributes blank-SKU order fees to a single product without losing them', () => {
    const blankSkuShipping = { ...base, id: 'blank-ship', sku: null, event: 'FEE' as const, quantity: null, amount: -12, amountType: 'SHIPPING_FEE' as const }
    const result = summarizeSkuProfit([events[0], blankSkuShipping], 'SKU-1', [{ sku: 'SKU-1', unitCost: 40, updatedAt: '' }], 'BLOCK')
    expect(result).toMatchObject({ shippingFees: 12, operatingNet: 88, netCogs: 40, profit: 48 })
  })

  it('builds and filters a product profitability portfolio while surfacing unassigned activity', () => {
    const otherSku = { ...base, id: 'other-sku', orderId: 'ORDER-2', sku: 'SKU-2', event: 'SALE' as const, amount: 200, amountType: 'PRODUCT_REVENUE' as const }
    const unassignedAd = { ...base, id: 'ad', orderId: null, sku: null, quantity: null, event: 'FEE' as const, amount: -30, amountType: 'ADVERTISING_FEE' as const }
    const all = [...events, otherSku, unassignedAd]
    const products = summarizeProductProfitability(all, [{ sku: 'SKU-1', unitCost: 40, updatedAt: '' }, { sku: 'SKU-2', unitCost: 250, updatedAt: '' }], 'BLOCK')
    const portfolio = summarizeProductPortfolio(products, all)
    expect(products).toHaveLength(2)
    expect(filterProductProfitability(products, { status: 'LOSS_MAKING' }).map((item) => item.sku)).toEqual(['SKU-2'])
    expect(portfolio).toMatchObject({ skuCount: 2, profitableSkuCount: 1, lossMakingSkuCount: 1, unassignedAdvertising: 30, unassignedOperating: -30, portfolioProfit: -22 })
    const ads = buildMetricSkuDrilldown('ADS', products, all)
    expect(ads.total).toBe(30)
    expect(ads.rows.find((row) => !row.assigned)).toMatchObject({ label: 'Unassigned', value: 30 })
    const profit = buildMetricSkuDrilldown('PROFIT', products, all)
    expect(profit.rows.reduce((sum, row) => sum + (row.value ?? 0), 0)).toBe(profit.total)
    expect(buildMetricSkuDrilldown('PROFIT_PER_DELIVERED_UNIT', products, all)).toMatchObject({ total: -11 })
    expect(buildMetricSkuDrilldown('BREAK_EVEN_TACOS', products, all).total).toBeCloseTo(8 / 300 * 100)
  })

  it('composes SKU order filters across canonical dimensions and activity', () => {
    const merchant = { ...base, accountType: 'Card', fulfillmentType: 'Merchant' }
    const refund = { ...merchant, id: 'refund', event: 'REFUND' as const, amount: -100, amountType: 'PRODUCT_REVENUE' as const, returnType: 'CUSTOMER_RETURN' as const }
    const result = summarizeOrders([...events.map((item) => ({ ...item, accountType: 'Card', fulfillmentType: 'Merchant' })), refund], [{ sku: 'SKU-1', unitCost: 40, updatedAt: '' }], 'BLOCK')
    expect(filterSkuOrders(result, { accountType: 'Card', fulfillmentType: 'Merchant', returnType: 'CUSTOMER_RETURN', transactionCategory: 'REFUND' })).toHaveLength(1)
    expect(filterSkuOrders(result, { accountType: 'COD' })).toHaveLength(0)
  })

  it('aggregates sales, profit, shipping, and return types by geography', () => {
    const refund = { ...base, id: 'refund', event: 'REFUND' as const, amount: -100, amountType: 'PRODUCT_REVENUE' as const, returnType: 'RTO' as const }
    const orders = summarizeOrders([...events, refund], [{ sku: 'SKU-1', unitCost: 40, updatedAt: '' }], 'BLOCK')
    expect(summarizeOrderGeography(orders, 'STATE')[0]).toMatchObject({ location: 'Delhi', orderCount: 1, grossSales: 100, easyShipFees: 10, marketplaceCharges: 10, refundValue: 100, rtoQuantity: 1, customerReturnQuantity: 0, returnQuantity: 1, returnRate: 100 })
  })

  it('builds the full SKU workspace and composes advanced order filters', () => {
    const refund = { ...base, id: 'refund', event: 'REFUND' as const, amount: -100, amountType: 'PRODUCT_REVENUE' as const, returnType: 'RTO' as const }
    const product = summarizeSkuProfit([...events, refund], 'SKU-1', [{ sku: 'SKU-1', unitCost: 40, updatedAt: '' }], 'BLOCK')
    const workspace = buildSkuWorkspace(product, { sku: 'SKU-1', grossSales: 100, directAdsSpend: 0, tacos: 0, roas: 0, attribution: 'UNATTRIBUTED' })
    expect(workspace.advertising).toMatchObject({ tacos: null, profitAfterAds: null, breakEvenTacos: 0 })
    expect(workspace.returns).toMatchObject({ rtoRate: 100, recoveredCogs: 40 })
    expect(workspace.waterfall.at(-1)?.label).toBe('Profit before ads')
    expect(filterSkuWorkspaceOrders(product.orders, { returnType: 'RTO', shippingReversalOnly: true })).toHaveLength(1)
    expect(filterSkuWorkspaceOrders(product.orders, { profitability: 'PROFITABLE', missingCostOnly: true })).toHaveLength(0)
  })
})
