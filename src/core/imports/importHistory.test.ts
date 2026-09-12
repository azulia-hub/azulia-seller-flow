import { describe, expect, it } from 'vitest'
import type { CanonicalDataset, CanonicalFinancialEvent } from '../data/types'
import { compareImports, profileDataset, type StoredImport } from './importHistory'

const base = { source: 'test', sourceDatasetId: 'd', sourceRow: 1, orderId: 'O1', sku: 'A', quantity: 1, amountClass: 'OPERATING' as const, state: null, city: null, status: null, rawType: 'Order', rawDescription: null, classified: true, raw: {} }
const sale = (id: string, date: string, amount: number): CanonicalFinancialEvent => ({ ...base, id, date, event: 'SALE', amount, amountType: 'PRODUCT_REVENUE' })
const dataset = (id: string, events: CanonicalFinancialEvent[]): CanonicalDataset => ({ source: 'test', events, quality: { source: 'test', sourceRowCount: events.length, normalizedEventCount: events.length, unknownTransactionTypes: [], unclassifiedEventCount: 0, missingKeys: { orderId: 0, sku: 0, date: 0 }, reconciliation: { supported: true, sourceTotal: events.reduce((sum, event) => sum + event.amount, 0), normalizedTotal: events.reduce((sum, event) => sum + event.amount, 0), difference: 0, reconciled: true } } })
const stored = (id: string, data: CanonicalDataset): StoredImport => ({ id, fileName: `${id}.csv`, importedAt: '2026-09-01', dataset: data, profile: profileDataset(data) })

describe('import history comparison', () => {
  it('profiles coverage and compares only the shared date period', () => {
    const left = stored('long', dataset('long', [sale('a', '1 Jan 2026', 100), sale('b', '1 Aug 2026', 200)]))
    const right = stored('aug', dataset('aug', [sale('x', '1 Aug 2026', 200), sale('y', '2 Aug 2026', 300)]))
    const result = compareImports(left, right, [{ sku: 'A', unitCost: 50, updatedAt: '' }], 'BLOCK')
    expect(left.profile).toMatchObject({ fromDate: '2026-01-01', toDate: '2026-08-01' })
    expect(result.overlap).toEqual({ fromDate: '2026-08-01', toDate: '2026-08-01' })
    expect(result.left).toMatchObject({ grossSales: 200, netCogs: 50, profitAfterAds: 150, eventCount: 1 })
    expect(result.right).toMatchObject({ grossSales: 200, netCogs: 50, profitAfterAds: 150, eventCount: 1 })
    expect(result).toMatchObject({ matchingEventCount: 1, leftOnlyEventCount: 0, rightOnlyEventCount: 0 })
    expect(result.identical).toBe(true)
    expect(result.difference).toMatchObject({ grossSales: 0, profitAfterAds: 0, eventCount: 0 })
  })

  it('reports no comparison when date ranges do not overlap', () => {
    const left = stored('jan', dataset('jan', [sale('a', '1 Jan 2026', 100)]))
    const right = stored('aug', dataset('aug', [sale('b', '1 Aug 2026', 100)]))
    expect(compareImports(left, right).overlap).toBeNull()
  })
})
