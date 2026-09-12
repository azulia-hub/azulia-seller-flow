import { parseCsv } from '../csv/parseCsv'

export interface ImportedCost { readonly sku: string; readonly unitCost: number; readonly effectiveFrom: string | null }
export interface CostImportResult { readonly costs: readonly ImportedCost[]; readonly issues: readonly string[] }

const key = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')

function parseWhitespaceTable(text: string): CostImportResult | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (!lines.length || !/^sku\s+unit\s*cost(?:\s+effective\s*from)?$/i.test(lines[0].replace(/\s+/g, ' '))) return null
  const byKey = new Map<string, ImportedCost>()
  const issues: string[] = []
  lines.slice(1).forEach((line, index) => {
    const match = line.match(/^(.*?)\s+(₹?\s*[-+]?\d[\d,]*(?:\.\d+)?)(?:\s+(\d{4}-\d{2}-\d{2}))?\s*$/)
    if (!match) { issues.push(`Row ${index + 2}: expected SKU followed by Unit Cost.`); return }
    const sku = match[1].trim()
    const unitCost = Number(match[2].replace(/[₹,\s]/g, ''))
    const effectiveFrom = match[3] ?? null
    if (!sku || !Number.isFinite(unitCost) || unitCost < 0) { issues.push(`Row ${index + 2}: invalid SKU or cost.`); return }
    const recordKey = `${sku.toLocaleLowerCase()}\u001f${effectiveFrom ?? ''}`
    if (byKey.has(recordKey)) issues.push(`Row ${index + 2}: duplicate ${sku} for ${effectiveFrom ?? 'default'}; the last value was used.`)
    byKey.set(recordKey, { sku, unitCost, effectiveFrom })
  })
  return { costs: [...byKey.values()], issues }
}

export function parseCostImport(text: string): CostImportResult {
  const whitespace = parseWhitespaceTable(text)
  if (whitespace) return whitespace
  const rows = parseCsv(text)
  if (!rows.length) return { costs: [], issues: ['No cost rows found.'] }
  const headers = Object.keys(rows[0])
  const skuHeader = headers.find((header) => ['sku', 'productsku', 'itemsku'].includes(key(header)))
  const costHeader = headers.find((header) => ['cost', 'unitcost', 'productcost', 'costprice', 'landedcost'].includes(key(header)))
  const dateHeader = headers.find((header) => ['effectivefrom', 'effectivedate', 'fromdate', 'startdate'].includes(key(header)))
  if (!skuHeader || !costHeader) return { costs: [], issues: ['Required columns were not found. Use SKU and Unit Cost.'] }

  const byKey = new Map<string, ImportedCost>()
  const issues: string[] = []
  rows.forEach((row, index) => {
    const sku = row[skuHeader]?.trim() ?? ''
    const rawCost = row[costHeader]?.trim() ?? ''
    const unitCost = Number(rawCost.replace(/[₹,$£€\s]/g, '').replace(/^\((.*)\)$/, '-$1'))
    const rawDate = dateHeader ? row[dateHeader]?.trim() ?? '' : ''
    const effectiveFrom = rawDate || null
    if (!sku) { issues.push(`Row ${index + 2}: SKU is blank.`); return }
    if (!rawCost || !Number.isFinite(unitCost) || unitCost < 0) { issues.push(`Row ${index + 2}: invalid cost for ${sku}.`); return }
    if (effectiveFrom && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) { issues.push(`Row ${index + 2}: Effective From must be YYYY-MM-DD for ${sku}.`); return }
    const recordKey = `${sku.toLocaleLowerCase()}\u001f${effectiveFrom ?? ''}`
    if (byKey.has(recordKey)) issues.push(`Row ${index + 2}: duplicate ${sku} for ${effectiveFrom ?? 'default'}; the last value was used.`)
    byKey.set(recordKey, { sku, unitCost, effectiveFrom })
  })
  return { costs: [...byKey.values()], issues }
}
