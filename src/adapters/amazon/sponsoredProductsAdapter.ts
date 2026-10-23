import { strFromU8, unzipSync } from 'fflate'
import type { SponsoredProductRow, SponsoredProductsReport } from '../../core/advertising/types'

const required = ['Impressions', 'Clicks', '7 Day Total Orders (#)', '7 Day Total Units (#)', 'Date', 'Advertised SKU', 'Advertised ASIN', 'Spend', '7 Day Total Sales (₹)', '7 Day Advertised SKU Sales (₹)', '7 Day Other SKU Sales (₹)']
const number = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[₹,%]/g, '').trim())
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error('The advertising workbook contains an invalid or negative performance value. Review the source file.')
  return parsed
}
const text = (value: unknown) => String(value ?? '').trim()
const decodeXml = (value: string) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const attribute = (source: string, name: string) => source.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? ''
const columnIndex = (reference: string) => [...reference.replace(/\d/g, '')].reduce((value, letter) => value * 26 + letter.toUpperCase().charCodeAt(0) - 64, 0)
const textNodes = (source: string) => [...source.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(match => decodeXml(match[1])).join('')

function parseSheetRows(sheet: string, sharedStrings: readonly string[]): unknown[][] {
  return [...sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(rowMatch => {
    const values: unknown[] = []
    const cells = rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)
    for (const cell of cells) {
      const reference = attribute(cell[1], 'r')
      const type = attribute(cell[1], 't')
      const rawValue = cell[2].match(/<v>([\s\S]*?)<\/v>/)?.[1]
      const value = type === 'inlineStr' ? textNodes(cell[2]) : type === 's' ? sharedStrings[Number(rawValue)] ?? '' : rawValue === undefined ? '' : Number(rawValue)
      values[columnIndex(reference) - 1] = value
    }
    return values
  })
}
const dateKey = (value: unknown): string => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number') return new Date(Date.UTC(1899, 11, 30 + value)).toISOString().slice(0, 10)
  const raw = text(value)
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (match) return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10)
}

export async function parseSponsoredProductsWorkbook(data: ArrayBuffer, fileName: string, id: string): Promise<SponsoredProductsReport> {
  const archive = unzipSync(new Uint8Array(data))
  const sheetBytes = archive['xl/worksheets/sheet1.xml']
  if (!sheetBytes) throw new Error('The advertising workbook has no worksheet.')
  const sharedBytes = archive['xl/sharedStrings.xml']
  const sharedStrings = sharedBytes ? [...strFromU8(sharedBytes).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(match => textNodes(match[1])) : []
  const sourceRows = parseSheetRows(strFromU8(sheetBytes), sharedStrings)
  const headers = (sourceRows.shift() ?? []).map(header => text(header))
  const missing = required.filter(header => !headers.includes(header))
  if (missing.length) throw new Error(`This is not a supported Sponsored Products Advertised product report. Missing: ${missing.join(', ')}.`)
  const column = (header: string) => headers.indexOf(header) + 1
  const value = (row: readonly unknown[], header: string) => row[column(header) - 1]
  const rows = sourceRows.filter(row => row.some(cell => text(cell))).map((row, index): SponsoredProductRow => {
    if (!dateKey(value(row, 'Date')) || !text(value(row, 'Advertised SKU'))) throw new Error(`Advertising worksheet row ${index + 2} is missing a valid date or advertised SKU. No rows were discarded.`)
    return ({
    raw: Object.fromEntries(headers.map((header, column) => [header, row[column] ?? ''])),
    date: dateKey(value(row, 'Date')), portfolio: text(value(row, 'Portfolio name')), campaign: text(value(row, 'Campaign Name')),
    adGroup: text(value(row, 'Ad Group Name')), advertisedSku: text(value(row, 'Advertised SKU')), advertisedAsin: text(value(row, 'Advertised ASIN')).toUpperCase(),
    impressions: number(value(row, 'Impressions')), clicks: number(value(row, 'Clicks')), spendExcludingTax: number(value(row, 'Spend')),
    attributedSales: number(value(row, '7 Day Total Sales (₹)')), advertisedSkuSales: number(value(row, '7 Day Advertised SKU Sales (₹)')),
    otherSkuSales: number(value(row, '7 Day Other SKU Sales (₹)')), orders: number(value(row, '7 Day Total Orders (#)')), units: number(value(row, '7 Day Total Units (#)')),
  }) })
  if (!rows.length) throw new Error('No dated advertised-product rows were found in this workbook.')
  const dates = rows.map(row => row.date).sort()
  return { id, fileName, importedAt: new Date().toISOString(), minDate: dates[0], maxDate: dates.at(-1)!, rows }
}
