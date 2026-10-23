import type { ProductCost } from './types'

export function productCostIdentity(sku: string, normalizeSku?: (sku: string) => string) {
  return (normalizeSku?.(sku) ?? sku).trim().toLowerCase()
}

/** Replaces one cost period without rewriting other SKUs or dated history. */
export function setProductCost(costs: readonly ProductCost[], record: ProductCost, normalizeSku?: (sku: string) => string): ProductCost[] {
  if (!record.sku.trim() || !Number.isFinite(record.unitCost) || record.unitCost < 0) throw new Error('Enter a valid product cost of zero or more.')
  if (record.effectiveFrom) {
    const date = new Date(`${record.effectiveFrom}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.effectiveFrom) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== record.effectiveFrom) throw new Error('Enter a valid effective date.')
  }
  const identity = productCostIdentity(record.sku, normalizeSku)
  return [...costs.filter(cost => productCostIdentity(cost.sku, normalizeSku) !== identity || (cost.effectiveFrom ?? '') !== (record.effectiveFrom ?? '')),
    { ...record, sku: record.sku.trim(), effectiveFrom: record.effectiveFrom || null }]
}
