import { describe, expect, it } from 'vitest'
import { toSpreadsheetXml } from './downloadWorkbook'

describe('spreadsheet workbook adapter', () => {
  it('creates separate escaped worksheets with numeric cells', () => {
    const xml = toSpreadsheetXml({ fileStem: 'audit', sheets: [{ name: 'A&B', headers: ['SKU', 'Value'], rows: [['<SKU>', 12.5]] }] })
    expect(xml).toContain('ss:Name="A&amp;B"')
    expect(xml).toContain('&lt;SKU&gt;')
    expect(xml).toContain('ss:Type="Number">12.5')
  })
})
