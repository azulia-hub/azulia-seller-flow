import { describe, expect, it } from 'vitest'
import { parseCostImport } from './parseCostImport'

describe('cost import', () => {
  it('accepts CSV and spreadsheet-style TSV', () => {
    expect(parseCostImport('SKU,Unit Cost\nA,12.5\nB,₹20').costs).toEqual([{ sku: 'A', unitCost: 12.5, effectiveFrom: null }, { sku: 'B', unitCost: 20, effectiveFrom: null }])
    expect(parseCostImport('Product SKU\tCost Price\nC\t30').costs).toEqual([{ sku: 'C', unitCost: 30, effectiveFrom: null }])
  })
  it('reports invalid and duplicate rows without losing valid costs', () => {
    const result = parseCostImport('sku,cost\nA,10\nA,11\nB,nope\n,20')
    expect(result.costs).toEqual([{ sku: 'A', unitCost: 11, effectiveFrom: null }])
    expect(result.issues).toHaveLength(3)
  })

  it('accepts whitespace-aligned files while preserving spaces inside SKUs', () => {
    const result = parseCostImport(`SKU    Unit Cost
27-I31F-NB1O    585.00
ACP Art Board-12x12-PO1 165.00
Cloth-Drying-Stand      1,450.00`)
    expect(result).toEqual({
      costs: [
        { sku: '27-I31F-NB1O', unitCost: 585, effectiveFrom: null },
        { sku: 'ACP Art Board-12x12-PO1', unitCost: 165, effectiveFrom: null },
        { sku: 'Cloth-Drying-Stand', unitCost: 1450, effectiveFrom: null },
      ],
      issues: [],
    })
  })

  it('imports multiple effective-dated costs for the same SKU', () => {
    expect(parseCostImport('SKU,Unit Cost,Effective From\nA,10,2026-01-01\nA,12,2026-07-01').costs).toEqual([
      { sku: 'A', unitCost: 10, effectiveFrom: '2026-01-01' },
      { sku: 'A', unitCost: 12, effectiveFrom: '2026-07-01' },
    ])
  })
})
