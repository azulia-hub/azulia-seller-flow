import type { BackupBundle } from '../../core/backup/backupBundle'
import { buildBackupBundle, parseBackupBundle } from '../../core/backup/backupBundle'
import type { ProductCost } from '../../core/costs/types'
import type { StoredImport } from '../../core/imports/importHistory'
import type { ClassificationRule } from '../../core/classification/types'
import { replaceImports } from './importStore'
import { saveProductCosts } from './costStore'
import { saveClassificationRules } from './classificationRuleStore'

export function downloadBackup(input: { imports: readonly StoredImport[]; costs: readonly ProductCost[]; classificationRules: readonly ClassificationRule[] }) {
  const bundle = buildBackupBundle(input)
  const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `azulia-seller-flow-backup-${bundle.exportedAt.slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export async function restoreBackup(text: string): Promise<BackupBundle> {
  const bundle = parseBackupBundle(text)
  await replaceImports(bundle.imports)
  saveProductCosts(bundle.costs)
  saveClassificationRules(bundle.classificationRules)
  return bundle
}
