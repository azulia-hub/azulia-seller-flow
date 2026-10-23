import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { parseSponsoredProductsWorkbook } from './sponsoredProductsAdapter'

describe('Sponsored Products workbook adapter', () => {
  const workbook = (headers: readonly string[], values?: readonly (string | number)[]) => {
    const cell = (value: string | number, index: number, row: number) => {
      let column = '', current = index + 1
      while (current) { column = String.fromCharCode(65 + (current - 1) % 26) + column; current = Math.floor((current - 1) / 26) }
      return typeof value === 'number' ? `<c r="${column}${row}"><v>${value}</v></c>` : `<c r="${column}${row}" t="inlineStr"><is><t>${value}</t></is></c>`
    }
    const rows = `<row r="1">${headers.map((value, index) => cell(value, index, 1)).join('')}</row>${values ? `<row r="2">${values.map((value, index) => cell(value, index, 2)).join('')}</row>` : ''}`
    return zipSync({ 'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`) }).buffer as ArrayBuffer
  }

  it('reads advertised product identity and performance without inventing financial events', async () => {
    const headers = ['Date', 'Portfolio name', 'Campaign Name', 'Ad Group Name', 'Advertised SKU', 'Advertised ASIN', 'Impressions', 'Clicks', 'Spend', '7 Day Total Sales (₹)', '7 Day Advertised SKU Sales (₹)', '7 Day Other SKU Sales (₹)', '7 Day Total Orders (#)', '7 Day Total Units (#)']
    const bytes = workbook(headers, [46235, 'P', 'C', 'G', 'SKU-1', 'b001', 100, 4, 20, 80, 60, 20, 2, 3])
    const result = await parseSponsoredProductsWorkbook(bytes, 'ads.xlsx', 'a')
    expect(result).toMatchObject({ fileName: 'ads.xlsx', minDate: '2026-08-01', maxDate: '2026-08-01' })
    expect(result.rows[0]).toMatchObject({ advertisedSku: 'SKU-1', advertisedAsin: 'B001', spendExcludingTax: 20, attributedSales: 80, advertisedSkuSales: 60, otherSkuSales: 20 })
  })

  it('preserves unknown source columns and rejects invalid rows instead of dropping them', async () => {
    const headers = ['Date', 'Advertised SKU', 'Advertised ASIN', 'Spend', '7 Day Total Sales (₹)', '7 Day Advertised SKU Sales (₹)', '7 Day Other SKU Sales (₹)', 'Impressions', 'Clicks', '7 Day Total Orders (#)', '7 Day Total Units (#)', 'Future field']
    const values = ['2026-08-01', 'SKU1', 'B001', 10, 20, 20, 0, 100, 2, 1, 1, 'preserve this']
    const parsed = await parseSponsoredProductsWorkbook(workbook(headers, values), 'ads.xlsx', 'a')
    expect(parsed.rows[0].raw?.['Future field']).toBe('preserve this')
    await expect(parseSponsoredProductsWorkbook(workbook(headers, ['', ...values.slice(1)]), 'ads.xlsx', 'a')).rejects.toThrow(/No rows were discarded/)
    const invalid = [...values]; invalid[3] = 'not-a-number'
    await expect(parseSponsoredProductsWorkbook(workbook(headers, invalid), 'ads.xlsx', 'a')).rejects.toThrow(/invalid/)
  })
  it('rejects unrelated workbooks visibly', async () => {
    await expect(parseSponsoredProductsWorkbook(workbook(['Anything']), 'wrong.xlsx', 'a')).rejects.toThrow(/not a supported/)
  })
})
