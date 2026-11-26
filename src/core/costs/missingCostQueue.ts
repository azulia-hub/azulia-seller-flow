import { canonicalDateKey } from '../analytics/dashboardSummary'
import type { CanonicalFinancialEvent } from '../data/types'

export function missingCostQueue(events: readonly CanonicalFinancialEvent[], skus: readonly string[]) {
  const sales = events.flatMap(event => {
    if (event.event !== 'SALE' || event.amountType !== 'PRODUCT_REVENUE' || !event.sku) return []
    const date = canonicalDateKey(event.orderPurchaseDate ?? event.date)
    return date ? [{ date, sku: event.sku, units: event.quantity ?? 0 }] : []
  })
  const latest = sales.reduce((max, sale) => sale.date > max ? sale.date : max, '')
  const cutoff = Date.parse(latest) - 29 * 86400000
  const counts = new Map(skus.map(sku => [sku, 0]))
  for (const sale of sales) {
    if (counts.has(sale.sku) && Date.parse(sale.date) >= cutoff) {
      counts.set(sale.sku, counts.get(sale.sku)! + sale.units)
    }
  }
  return [...counts].map(([sku, units]) => ({ sku, units }))
    .sort((a, b) => b.units - a.units || a.sku.localeCompare(b.sku))
}
