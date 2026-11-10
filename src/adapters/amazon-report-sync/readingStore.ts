import type { SourceOrderSummary } from './protocol'
import { loadImports, saveImport } from '../browser/importStore'
import { profileDataset, type StoredImport } from '../../core/imports/importHistory'
import type { RawDataset, CanonicalDataset } from '../../core/data/types'
export const deliveryVersion = 12
export interface AutomaticReading extends StoredImport { deliveryVersion: number; connectionKey: string; revision: number; sourceRecords?: Record<string, unknown>[]; sourceOrders?: SourceOrderSummary[]; raw: RawDataset; issues: string[] }
export function findReading(imports: readonly StoredImport[], connectionKey: string): AutomaticReading | null {
  const value = imports.find(item => item.id === `api:${connectionKey}`) as AutomaticReading | undefined
  return value && value.deliveryVersion === deliveryVersion && value.connectionKey === connectionKey ? value : null
}
export async function saveReading(connectionKey: string, revision: number, value: { raw: RawDataset; dataset: CanonicalDataset; issues: string[] }, sourceRecords: Record<string, unknown>[], sourceOrders: SourceOrderSummary[] = []) {
  const reading: AutomaticReading = { id: `api:${connectionKey}`, fileName: 'Amazon activity · automatic', importedAt: new Date().toISOString(), profile: profileDataset(value.dataset), deliveryVersion, connectionKey, revision, sourceRecords, sourceOrders, ...value }
  await saveImport(reading)
  return reading
}
export async function loadReading(connectionKey: string) { return findReading(await loadImports(), connectionKey) }

/** Acknowledge unchanged source content without recalculating or changing the calculation time. */
export async function advanceReading(reading: AutomaticReading, revision: number, sourceOrders: SourceOrderSummary[]): Promise<AutomaticReading> {
  const advanced = { ...reading, revision, sourceOrders }
  await saveImport(advanced)
  return advanced
}
