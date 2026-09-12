import type { AuditWorkbook, WorkbookCell } from '../../core/export/auditWorkbook'

const escapeXml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const cell = (value: WorkbookCell) => value == null
  ? '<Cell><Data ss:Type="String"></Data></Cell>'
  : typeof value === 'number'
    ? `<Cell><Data ss:Type="Number">${Number.isFinite(value) ? value : 0}</Data></Cell>`
    : typeof value === 'boolean'
      ? `<Cell><Data ss:Type="Boolean">${value ? 1 : 0}</Data></Cell>`
      : `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`

export function toSpreadsheetXml(workbook: AuditWorkbook) {
  const worksheets = workbook.sheets.map(sheet => `<Worksheet ss:Name="${escapeXml(sheet.name.slice(0, 31))}"><Table><Row ss:StyleID="Header">${sheet.headers.map(cell).join('')}</Row>${sheet.rows.map(row => `<Row>${row.map(cell).join('')}</Row>`).join('')}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions></Worksheet>`).join('')
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#DCEBFA" ss:Pattern="Solid"/></Style></Styles>${worksheets}</Workbook>`
}

export function downloadWorkbook(workbook: AuditWorkbook) {
  const blob = new Blob([toSpreadsheetXml(workbook)], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${workbook.fileStem}-audit-export.xml`
  link.click()
  URL.revokeObjectURL(url)
}
