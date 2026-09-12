import type { CanonicalFinancialEvent } from '../data/types'
import { calculateCosts, resolveProductCost } from './calculateCosts'
import type { ProductCost } from './types'

export type BulkCostMode = 'SET' | 'INCREASE_PERCENT' | 'DECREASE_PERCENT'
export interface BulkCostEditSpec {
  readonly skus: readonly string[]
  readonly mode: BulkCostMode
  readonly value: number
  readonly effectiveFrom: string | null
  readonly overwriteConflicts: boolean
}
export interface BulkCostChange { readonly sku: string; readonly previousCost: number | null; readonly nextCost: number; readonly effectiveFrom: string | null; readonly conflict: boolean }
export interface BulkCostEditResult { readonly costs: readonly ProductCost[]; readonly changes: readonly BulkCostChange[]; readonly conflicts: readonly string[]; readonly missingBaseSkus: readonly string[]; readonly valid: boolean }
export interface BulkCostPreview extends BulkCostEditResult { readonly currentNetCogs: number; readonly nextNetCogs: number; readonly netCogsChange: number }

const key = (sku: string, date: string | null, normalizeSku: (sku: string) => string) => `${normalizeSku(sku).trim().toLocaleLowerCase()}\u001f${date ?? ''}`
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export function applyBulkCostEdit(costs: readonly ProductCost[], spec: BulkCostEditSpec, normalizeSku: (sku: string) => string = value => value): BulkCostEditResult {
  const uniqueSkus = [...new Map(spec.skus.map(sku => [normalizeSku(sku).trim().toLocaleLowerCase(), sku.trim()])).values()].filter(Boolean)
  if (!uniqueSkus.length || !Number.isFinite(spec.value) || spec.value < 0) return { costs, changes: [], conflicts: [], missingBaseSkus: [], valid: false }
  const existingByKey = new Map(costs.map(cost => [key(cost.sku, cost.effectiveFrom ?? null, normalizeSku), cost]))
  const changes: BulkCostChange[] = []
  const missingBaseSkus: string[] = []
  uniqueSkus.forEach(sku => {
    const targetKey = key(sku, spec.effectiveFrom, normalizeSku)
    const conflict = existingByKey.has(targetKey)
    const active = resolveProductCost(costs, sku, spec.effectiveFrom, normalizeSku)
    if (spec.mode !== 'SET' && !active) { missingBaseSkus.push(sku); return }
    const previousCost = active?.unitCost ?? null
    const nextCost = spec.mode === 'SET' ? round(spec.value) : round((previousCost ?? 0) * (spec.mode === 'INCREASE_PERCENT' ? 1 + spec.value / 100 : Math.max(0, 1 - spec.value / 100)))
    changes.push({ sku, previousCost, nextCost, effectiveFrom: spec.effectiveFrom, conflict })
  })
  const conflicts = changes.filter(change => change.conflict).map(change => change.sku)
  const valid = changes.length > 0 && missingBaseSkus.length === 0 && (spec.overwriteConflicts || conflicts.length === 0)
  if (!valid) return { costs, changes, conflicts, missingBaseSkus, valid }
  const next = new Map(existingByKey)
  changes.forEach(change => next.set(key(change.sku, change.effectiveFrom, normalizeSku), { sku: change.sku, unitCost: change.nextCost, effectiveFrom: change.effectiveFrom, updatedAt: '' }))
  return { costs: [...next.values()], changes, conflicts, missingBaseSkus, valid }
}

export function previewBulkCostEdit(events: readonly CanonicalFinancialEvent[], costs: readonly ProductCost[], spec: BulkCostEditSpec, normalizeSku: (sku: string) => string = value => value): BulkCostPreview {
  const edit = applyBulkCostEdit(costs, spec, normalizeSku)
  const currentNetCogs = calculateCosts(events, costs, 'BLOCK', normalizeSku).netCogs
  const nextNetCogs = edit.valid ? calculateCosts(events, edit.costs, 'BLOCK', normalizeSku).netCogs : currentNetCogs
  return { ...edit, currentNetCogs, nextNetCogs, netCogsChange: round(nextNetCogs - currentNetCogs) }
}
