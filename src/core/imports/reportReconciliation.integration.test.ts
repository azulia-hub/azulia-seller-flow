import { describe, expect, it } from 'vitest'
import { amazonUnifiedTransactionAdapter, normalizeAmazonSku } from '../../adapters/amazon/unifiedTransactionAdapter'
import { parseCsvDataset } from '../csv/parseCsv'
import { compareImports, profileDataset, type StoredImport } from './importHistory'
import sanitizedReport from '../../adapters/amazon/__fixtures__/unified-transactions.csv?raw'

function imported(id: string, fileName: string, source: string): StoredImport {
  const raw = parseCsvDataset(source, id, fileName)
  const dataset = amazonUnifiedTransactionAdapter.normalize(raw)
  return { id, fileName, importedAt: '2026-09-11', dataset, profile: profileDataset(dataset) }
}

describe('report financial reconciliation integration', () => {
  const datedReport = sanitizedReport.replace(/Aug (\d+) 2026/g, '$1 Aug 2026')
  const august = imported('august-only', 'sanitized-august.csv', datedReport)
  const revisedSource = datedReport.replace('New source event,1,Delhi,DL,200', 'New source event,1,Delhi,DL,225').replace(',25,225,unknown-raw', ',25,250,unknown-raw')
  const yearToAugust = imported('year-to-august', 'sanitized-revision.csv', revisedSource)
  const costs = [{ sku: 'SKU-RED', unitCost: 300, updatedAt: '2026-09-11' }, { sku: 'SKU-BLUE', unitCost: 80, updatedAt: '2026-09-11' }]
  const comparison = compareImports(yearToAugust, august, costs, 'ASSUME_ZERO', (_source, sku) => normalizeAmazonSku(sku))

  it('preserves every rupee while normalizing both source reports', () => {
    expect(august.dataset.quality.reconciliation).toMatchObject({ supported: true, difference: 0, reconciled: true })
    expect(yearToAugust.dataset.quality.reconciliation).toMatchObject({ supported: true, difference: 0, reconciled: true })
  })

  it('compares only their shared August coverage through the production analytics path', () => {
    expect(comparison.overlap).toEqual({ fromDate: '2026-08-01', toDate: '2026-08-09' })
    expect(comparison.matchingEventCount).toBeGreaterThan(0)
    expect(comparison.leftOnlyEventCount).toBeGreaterThan(0)
    expect(comparison.rightOnlyEventCount).toBeGreaterThan(0)
    expect(comparison.identical).toBe(false)
    expect(comparison.left).not.toBeNull()
    expect(comparison.right).not.toBeNull()
    expect(comparison.difference).not.toBeNull()
    expect(comparison.left!.operatingNet).not.toBe(comparison.right!.operatingNet)
    expect(comparison.difference!.operatingNet).toBe(25)
  })
})
