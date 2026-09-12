import type { RawRow } from '../data/types'
import { createRawDataset } from '../data/rawDataset'

export type Row = Record<string, string>

function parseDelimitedRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    const next = text[i + 1]

    if (ch === '"' && quoted && next === '"') {
      cell += '"'
      i += 1
      continue
    }
    if (ch === '"') {
      quoted = !quoted
      continue
    }
    if (ch === delimiter && !quoted) {
      row.push(cell)
      cell = ''
      continue
    }
    if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i += 1
      row.push(cell)
      cell = ''
      if (row.some((v) => v.length > 0)) rows.push(row)
      row = []
      continue
    }
    cell += ch
  }

  if (cell.length || row.length) {
    row.push(cell)
    if (row.some((v) => v.length > 0)) rows.push(row)
  }

  return rows
}

function tableFromText(text: string) {
  const candidates = [',', '\t', ';'].map((delimiter) => ({
    delimiter,
    rows: parseDelimitedRows(text, delimiter),
  }))
  const selected = candidates.sort((left, right) => {
    const width = (rows: string[][]) => Math.max(0, ...rows.map((row) => row.length))
    return width(right.rows) - width(left.rows)
  })[0]
  const parsedRows = selected?.rows ?? []
  const maxNonEmpty = Math.max(0, ...parsedRows.map((row) => row.filter((cell) => cell.trim() !== '').length))
  const minimumHeaderCells = Math.max(2, Math.ceil(maxNonEmpty * 0.8))
  const headerIndex = parsedRows.findIndex(
    (candidate) => candidate.filter((cell) => cell.trim() !== '').length >= minimumHeaderCells,
  )
  const rawHeader = headerIndex >= 0 ? parsedRows[headerIndex] : []
  const body = headerIndex >= 0 ? parsedRows.slice(headerIndex + 1) : []
  const header = rawHeader.map((key, index) => {
    const withoutBom = index === 0 ? key.replace(/^\uFEFF/, '') : key
    return withoutBom.trim()
  })
  return {
    rows: body.map((values) =>
      Object.fromEntries(header.map((key, index) => [key, values[index]?.trim() ?? ''])),
    ),
    skippedRows: Math.max(0, headerIndex),
    delimiter: selected?.delimiter ?? ',',
  }
}

export function parseCsv(text: string): Row[] {
  return tableFromText(text).rows
}

export function parseCsvDataset(text: string, id: string, name: string) {
  const parsed = tableFromText(text)
  const rows = parsed.rows
  return createRawDataset({
    id,
    name,
    headers: rows.length ? Object.keys(rows[0]) : [],
    rows: rows as RawRow[],
    metadata: {
      delimiter: parsed.delimiter === '\t' ? 'tab' : parsed.delimiter,
      skippedPreambleRows: String(parsed.skippedRows),
    },
  })
}
