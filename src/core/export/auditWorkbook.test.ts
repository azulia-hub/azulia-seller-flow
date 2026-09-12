import { describe, expect, it } from 'vitest'
import type { CanonicalDataset, CanonicalFinancialEvent } from '../data/types'
import { buildAuditWorkbook } from './auditWorkbook'

const base = { source: 'test', sourceDatasetId: 'dataset', sourceRow: 1, date: '1 Aug 2026', orderId: 'ORDER-1', sku: 'SKU-1', quantity: 1, state: 'Delhi', city: 'Delhi', status: 'Released', rawType: '', rawDescription: null, classified: true, raw: {} }
const events: CanonicalFinancialEvent[] = [
  { ...base, id: 'sale', event: 'SALE', amount: 100, amountClass: 'OPERATING', amountType: 'PRODUCT_REVENUE' },
  { ...base, id: 'fee', event: 'FEE', amount: -10, quantity: null, amountClass: 'OPERATING', amountType: 'COMMISSION' },
  { ...base, id: 'unknown', event: 'UNKNOWN', amount: -3, quantity: null, amountClass: 'OPERATING', amountType: 'UNKNOWN', rawType: 'Mystery', classified: false },
  { ...base, id: 'transfer', event: 'SETTLEMENT', amount: -87, quantity: null, amountClass: 'SETTLEMENT', amountType: 'OTHER' },
]
const dataset: CanonicalDataset = { source: 'test', events, quality: { source: 'test', sourceRowCount: 4, normalizedEventCount: 4, unknownTransactionTypes: ['Mystery'], unclassifiedEventCount: 1, missingKeys: { orderId: 0, sku: 0, date: 0 }, reconciliation: { supported: true, sourceTotal: 0, normalizedTotal: 0, difference: 0, reconciled: true } } }

describe('audit workbook', () => {
  it('exports financial detail and proves settlement exclusion without dropping unknowns', () => {
    const workbook = buildAuditWorkbook({ dataset, events, costs: [{ sku: 'SKU-1', unitCost: 40, updatedAt: '' }], missingCostPolicy: 'BLOCK', fileName: 'report.csv' })
    expect(workbook.sheets.map(sheet => sheet.name)).toEqual(['Read me', 'Summary', 'SKUs', 'Orders', 'Returns', 'Fees', 'Reconciliation', 'Unclassified'])
    const summary = workbook.sheets.find(sheet => sheet.name === 'Summary')!
    expect(summary.rows.find(row => row[0] === 'Operating net')?.[1]).toBe(87)
    expect(summary.rows.find(row => row[0] === 'Profit after ads')?.[1]).toBe(47)
    const reconciliation = workbook.sheets.find(sheet => sheet.name === 'Reconciliation')!
    expect(reconciliation.rows.find(row => row[0] === 'Operating profit boundary')?.slice(2, 6)).toEqual([87, 87, 0, 'Matched'])
    expect(reconciliation.rows.find(row => row[0] === 'Settlement disclosure')?.[2]).toBe(-87)
    expect(workbook.sheets.find(sheet => sheet.name === 'Unclassified')?.rows).toHaveLength(1)
  })
})
