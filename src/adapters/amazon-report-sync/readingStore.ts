import type { PulseScoreboard } from '../../core/analytics/pulseScoreboard'
import type { SourceOrderSummary } from './protocol'
import { loadImports, saveImport } from '../browser/importStore'
import { profileDataset, type StoredImport } from '../../core/imports/importHistory'
import type { RawDataset, CanonicalDataset } from '../../core/data/types'
import { persistentDevice, readDeviceEntry, persistReading } from '../device/workspace'
export const deliveryVersion = 15
export interface AutomaticReading extends StoredImport { precomputed?:{key:string;scoreboard:PulseScoreboard}; deliveryVersion: number; connectionKey: string; revision: number; sourceRecords?: Record<string, unknown>[]; sourceOrders?: SourceOrderSummary[]; raw: RawDataset; issues: string[] }
async function retainReading(reading: AutomaticReading) {
  if (!persistentDevice) { await saveImport(reading); return }
  await persistReading(reading.connectionKey, reading)
  try { await saveImport(reading) } catch { /* SQLite is authoritative; a full browser cache must not block its reading. */ }
}
export function findReading(imports: readonly StoredImport[], connectionKey: string): AutomaticReading | null {
  const value = imports.find(item => item.id === `api:${connectionKey}`) as AutomaticReading | undefined
  return value && value.deliveryVersion === deliveryVersion && value.connectionKey === connectionKey ? value : null
}
export async function saveReading(connectionKey: string, revision: number, value: { raw: RawDataset; dataset: CanonicalDataset; issues: string[] }, sourceRecords: Record<string, unknown>[], sourceOrders: SourceOrderSummary[] = []) {
  const reading: AutomaticReading = { id: `api:${connectionKey}`, fileName: 'Amazon activity · automatic', importedAt: new Date().toISOString(), profile: profileDataset(value.dataset), deliveryVersion, connectionKey, revision, sourceRecords, sourceOrders, ...value }
  await retainReading(reading)
  return reading
}
export async function loadReading(connectionKey: string) {
  if (persistentDevice) {
    const entry = await readDeviceEntry<AutomaticReading>(`reading:${connectionKey}`)
    if (entry.value) return findReading([entry.value], connectionKey)
    const legacy = findReading(await loadImports(), connectionKey)
    if (legacy) await persistReading(connectionKey, legacy)
    return legacy
  }
  return findReading(await loadImports(), connectionKey)
}

/** Acknowledge unchanged source content without recalculating or changing the calculation time. */
export async function advanceReading(reading: AutomaticReading, revision: number, sourceOrders: SourceOrderSummary[]): Promise<AutomaticReading> {
  const advanced = { ...reading, revision, sourceOrders }
  // The content is identical. Keep this cursor in memory; after restart the old
  // durable cursor safely replays the delta against its matching saved baseline.
  // The next actual content change persists the complete newer cursor + reading.
  return advanced
}
