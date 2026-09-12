import { useState } from 'react'
import type { AmountType, RawDataset } from '../../core/data/types'
import type { CanonicalFieldMapping, MappingSpec } from '../../core/normalize/types'
import { numericColumns, suggestGenericMapping } from '../../adapters/generic-csv/suggestMapping'

interface Props { readonly dataset: RawDataset; readonly onApply: (spec: MappingSpec) => void }
const fieldLabels: ReadonlyArray<[keyof CanonicalFieldMapping, string]> = [
  ['date', 'Date'], ['orderId', 'Order ID'], ['sku', 'SKU'], ['quantity', 'Quantity'],
  ['accountType', 'Account / payment type'], ['fulfillmentType', 'Fulfillment type'],
  ['rawType', 'Transaction type'], ['description', 'Description'], ['status', 'Status'],
]
const amountTypes: AmountType[] = ['PRODUCT_REVENUE', 'SHIPPING_REVENUE', 'GIFT_WRAP_REVENUE', 'PROMOTION', 'TAX', 'COMMISSION', 'FULFILLMENT_FEE', 'SHIPPING_FEE', 'ADVERTISING_FEE', 'OTHER_FEE', 'OTHER', 'UNKNOWN']

export function MappingPanel({ dataset, onApply }: Props) {
  const initial = suggestGenericMapping(dataset)
  const [fields, setFields] = useState<CanonicalFieldMapping>(initial.fields)
  const candidates = numericColumns(dataset)
  const [selected, setSelected] = useState(() => new Set(initial.amounts.map((item) => item.column)))
  const [types, setTypes] = useState<Record<string, AmountType>>(() => Object.fromEntries(initial.amounts.map((item) => [item.column, item.amountType])))
  const [totalColumn, setTotalColumn] = useState(initial.totalColumn ?? '')

  return <section className="panel mapping-panel">
    <div className="panel-head"><div><small>Unknown CSV</small><h3>Map columns to the normalized model</h3></div></div>
    <p>Your original columns remain attached to every event. Confirm the suggested fields and monetary columns.</p>
    <div className="mapping-fields">{fieldLabels.map(([field, label]) => <label key={field}>{label}<select value={fields[field] ?? ''} onChange={(event) => setFields({ ...fields, [field]: event.target.value || undefined })}><option value="">Not mapped</option>{dataset.headers.map((header) => <option key={header}>{header}</option>)}</select></label>)}</div>
    <label className="mapping-total">Row total for reconciliation<select value={totalColumn} onChange={(event) => setTotalColumn(event.target.value)}><option value="">Not available</option>{candidates.map((header) => <option key={header}>{header}</option>)}</select></label>
    <div className="amount-mappings"><strong>Monetary columns</strong>{candidates.map((column) => <label key={column}><input type="checkbox" checked={selected.has(column)} onChange={(event) => { const next = new Set(selected); event.target.checked ? next.add(column) : next.delete(column); setSelected(next) }} /><span>{column}</span><select value={types[column] ?? 'UNKNOWN'} onChange={(event) => setTypes({ ...types, [column]: event.target.value as AmountType })}>{amountTypes.map((type) => <option key={type}>{type}</option>)}</select></label>)}</div>
    <button className="primary" disabled={!selected.size} onClick={() => onApply({ id: `generic:${dataset.id}`, source: 'generic-csv', fields, totalColumn: totalColumn || undefined, amounts: [...selected].filter((column) => column !== totalColumn).map((column) => ({ column, amountType: types[column] ?? 'UNKNOWN', event: 'OTHER' })) })}>Normalize dataset</button>
    <div className="raw-preview"><strong>Raw preview</strong><div className="table-scroll"><table><thead><tr>{dataset.headers.slice(0, 8).map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{dataset.rows.slice(0, 3).map((row, index) => <tr key={index}>{dataset.headers.slice(0, 8).map((header) => <td key={header}>{String(row[header] ?? '')}</td>)}</tr>)}</tbody></table></div></div>
  </section>
}
