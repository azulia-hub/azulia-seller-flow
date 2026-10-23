import type { CanonicalFinancialEvent } from '../data/types'
import type { ProductCost } from '../costs/types'
import type { MissingCostPolicy } from '../costs/calculateCosts'
import { productCostIdentity } from '../costs/setProductCost'
import { summarizeSkuProfit, type SkuProfitSummary } from './orderProfit'

/** Only products affected by a cost draft need their detailed results rebuilt. */
export function previewProductProfitability(saved: readonly SkuProfitSummary[], events: readonly CanonicalFinancialEvent[], costs: readonly ProductCost[], policy: MissingCostPolicy, draftSku: string, normalizeSku?: (sku: string) => string): SkuProfitSummary[] {
  const identity = productCostIdentity(draftSku, normalizeSku)
  return saved.map(product => productCostIdentity(product.sku, normalizeSku) === identity ? summarizeSkuProfit(events, product.sku, costs, policy, normalizeSku) : product)
}
