export type CsvCell = string | number | boolean | null | undefined

function escapeCell(value: CsvCell) {
  const text = value == null ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(headers: readonly string[], rows: readonly (readonly CsvCell[])[]) {
  return [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n')
}
