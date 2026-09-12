import { describe, expect, it } from 'vitest'
import type { CanonicalDataset, CanonicalFinancialEvent } from '../data/types'
import { buildDataQualityCenter } from './dataQualityCenter'

const base: CanonicalFinancialEvent = { id: 'e', source: 'test', sourceDatasetId: 'd', sourceRow: 1, date: '2026-08-01', orderId: 'o1', sku: 'SKU-1', event: 'SALE', quantity: 1, amount: 100, amountClass: 'OPERATING', amountType: 'PRODUCT_REVENUE', state: 'X', city: 'Y', status: 'Released', rawType: 'Order', rawDescription: null, classified: true, raw: {} }
const dataset = (events: CanonicalFinancialEvent[]): CanonicalDataset => ({ source: 'test', events, quality: { source: 'test', sourceRowCount: events.length, normalizedEventCount: events.length, unknownTransactionTypes: [], unclassifiedEventCount: 0, missingKeys: { orderId: 0, sku: 0, date: 0 }, reconciliation: { supported: true, sourceTotal: events.reduce((sum, event) => sum + event.amount, 0), normalizedTotal: events.reduce((sum, event) => sum + event.amount, 0), difference: 0, reconciled: true } } })

describe('buildDataQualityCenter', () => {
  it('surfaces missing costs, unknown money, deferred activity and unassigned charges', () => {
    const events = [base, { ...base, id: 'u', orderId: null, sku: null, event: 'UNKNOWN' as const, amount: -25, amountType: 'UNKNOWN' as const, classified: false, status: 'Deferred', rawType: 'Mystery' }, { ...base, id: 'a', orderId: null, sku: null, event: 'FEE' as const, amount: -10, amountType: 'ADVERTISING_FEE' as const }]
    const result = buildDataQualityCenter(dataset(events), [])
    expect(result.overall).toBe('WARNING')
    expect(result.missingCostSkus).toEqual(['SKU-1'])
    expect(result.unassignedAdvertising).toBe(10)
    expect(result.deferredEvents).toBe(1)
    expect(result.evidence.some(item => item.reason === 'Unclassified')).toBe(true)
  })

  it('detects duplicates and overlap while excluding the current saved import', () => {
    const current = dataset([base, { ...base, id: 'copy', sourceRow: 2 }])
    const saved = { id: 'old', fileName: 'old.csv', importedAt: '', dataset: dataset([{ ...base, id: 'old-event' }]), profile: { fromDate: '2026-08-01', toDate: '2026-08-01', datedEventCount: 1, undatedEventCount: 0, orderCount: 1 } }
    const result = buildDataQualityCenter(current, [{ sku: 'SKU-1', unitCost: 20, updatedAt: '2026-08-01' }], [saved], 'current')
    expect(result.duplicateEventCount).toBe(1)
    expect(result.overlaps[0]).toMatchObject({ importId: 'old', matchingEvents: 1, coveragePercent: 50 })
  })
})
