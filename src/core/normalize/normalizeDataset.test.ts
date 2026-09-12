import { describe, expect, it } from 'vitest'
import { createRawDataset } from '../data/rawDataset'
import { normalizeDataset } from './normalizeDataset'
import type { MappingSpec } from './types'

const raw = createRawDataset({
  id: 'custom-ledger', name: 'custom.csv',
  rows: [
    { When: '2026-09-01', Reference: 'A-1', Item: 'SKU-1', Kind: 'Purchase', Revenue: '100', Charges: '-12', Balance: '88', Extra: 'kept' },
    { When: '2026-09-02', Reference: 'A-2', Item: 'SKU-2', Kind: 'Mystery', Revenue: '50', Charges: '-5', Balance: '45', Extra: 'also kept' },
  ],
})

const mapping: MappingSpec = {
  id: 'custom-map', source: 'custom-marketplace', totalColumn: 'Balance',
  fields: { date: 'When', orderId: 'Reference', sku: 'Item', rawType: 'Kind' },
  types: [{ value: 'Purchase', event: 'SALE' }],
  amounts: [
    { column: 'Revenue', amountType: 'PRODUCT_REVENUE', event: 'SALE' },
    { column: 'Charges', amountType: 'OTHER_FEE', event: 'FEE' },
  ],
}

describe('generic mapping normalization', () => {
  it('normalizes arbitrary column names using only a declarative specification', () => {
    const result = normalizeDataset(raw, mapping)
    expect(result.events.filter((event) => event.sourceRow === 1).map((event) => event.amount)).toEqual([100, -12])
    expect(result.events[0]).toMatchObject({ source: 'custom-marketplace', orderId: 'A-1', sku: 'SKU-1', event: 'SALE' })
    expect(result.events[0]?.raw.Extra).toBe('kept')
    expect(result.quality.reconciliation).toMatchObject({ sourceTotal: 133, normalizedTotal: 133, reconciled: true })
  })

  it('preserves unrecognized type labels and their money', () => {
    const result = normalizeDataset(raw, mapping)
    const unknown = result.events.filter((event) => event.sourceRow === 2)
    expect(result.quality.unknownTransactionTypes).toEqual(['Mystery'])
    expect(unknown.every((event) => event.event === 'UNKNOWN' && !event.classified)).toBe(true)
    expect(unknown.reduce((sum, event) => sum + event.amount, 0)).toBe(45)
  })
})
