import type { CanonicalFinancialEvent } from '../data/types'
import type { SkuProfitSummary } from '../analytics/orderProfit'
import type { AdvertisingFinancialProduct } from './workspace'

/** Reuse verified financial profit/cost results; isolate product principal for TACOS. */
export function financialProductsForAdvertising(events: readonly CanonicalFinancialEvent[], products: readonly SkuProfitSummary[]): readonly AdvertisingFinancialProduct[] {
  const principal = new Map<string, number>()
  for (const event of events) {
    if (!event.sku || event.event !== 'SALE' || event.amountType !== 'PRODUCT_REVENUE' || event.amount <= 0) continue
    principal.set(event.sku, (principal.get(event.sku) ?? 0) + event.amount)
  }
  return products.map(product => ({ productId: product.sku, totalProductSales: Math.round(((principal.get(product.sku) ?? 0) + Number.EPSILON) * 100) / 100,
    contributionBeforeReportedAds: product.profitReady && !product.missingCost ? product.profit + product.advertising : null,
    completeCosts: product.profitReady && !product.missingCost }))
}
