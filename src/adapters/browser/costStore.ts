import type { ProductCost } from '../../core/costs/types'

const storageKey = 'sellerflow.product-costs.v2'
const legacyStorageKey = 'sellerflow.product-costs.v1'

export function loadProductCosts(): ProductCost[] {
  try {
    const current = localStorage.getItem(storageKey)
    const parsed: unknown = JSON.parse(current ?? localStorage.getItem(legacyStorageKey) ?? '[]')
    if (!Array.isArray(parsed)) return []
    const costs = parsed.filter((item): item is ProductCost => Boolean(item && typeof item.sku === 'string' && Number.isFinite(item.unitCost) && typeof item.updatedAt === 'string')).map(item => ({ ...item, effectiveFrom: typeof item.effectiveFrom === 'string' ? item.effectiveFrom : null }))
    if (!current && costs.length) localStorage.setItem(storageKey, JSON.stringify(costs))
    return costs
  } catch { return [] }
}

export function saveProductCosts(costs: readonly ProductCost[]) {
  localStorage.setItem(storageKey, JSON.stringify(costs))
}
