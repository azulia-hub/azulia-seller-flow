import { toCsv, type CsvCell } from '../../core/export/toCsv'

export function downloadCsv(fileName: string, headers: readonly string[], rows: readonly (readonly CsvCell[])[]) {
  const blob = new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
