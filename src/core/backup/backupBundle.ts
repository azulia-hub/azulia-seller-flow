import type { ProductCost } from '../costs/types'
import type { StoredImport } from '../imports/importHistory'
import type { ClassificationRule } from '../classification/types'

export const BACKUP_VERSION = 1
export interface BackupBundle { readonly product: 'SellerFlow'; readonly version: 1; readonly exportedAt: string; readonly imports: readonly StoredImport[]; readonly costs: readonly ProductCost[]; readonly classificationRules: readonly ClassificationRule[] }

export function buildBackupBundle(input: Omit<BackupBundle, 'product' | 'version' | 'exportedAt'>, exportedAt = new Date().toISOString()): BackupBundle {
  return { product: 'SellerFlow', version: BACKUP_VERSION, exportedAt, imports: input.imports, costs: input.costs, classificationRules: input.classificationRules }
}

export function parseBackupBundle(value: string): BackupBundle {
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { throw new Error('This is not a valid SellerFlow backup file.') }
  if (!parsed || typeof parsed !== 'object') throw new Error('This is not a valid SellerFlow backup file.')
  const item = parsed as Partial<BackupBundle>
  if (item.product !== 'SellerFlow' || item.version !== BACKUP_VERSION) throw new Error('This backup format is not supported by this version of SellerFlow.')
  if (!Array.isArray(item.imports) || !Array.isArray(item.costs) || !Array.isArray(item.classificationRules)) throw new Error('The backup is incomplete or damaged.')
  if (!item.imports.every(entry => entry && typeof entry.id === 'string' && entry.dataset && Array.isArray(entry.dataset.events))) throw new Error('The backup contains an invalid report.')
  if (!item.costs.every(cost => cost && typeof cost.sku === 'string' && Number.isFinite(cost.unitCost))) throw new Error('The backup contains an invalid product cost.')
  if (!item.classificationRules.every(rule => rule && typeof rule.id === 'string' && typeof rule.rawType === 'string')) throw new Error('The backup contains an invalid classification rule.')
  return item as BackupBundle
}
