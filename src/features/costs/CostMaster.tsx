import { useMemo, useState } from 'react'
import type { CanonicalFinancialEvent } from '../../core/data/types'
import type { ProductCost } from '../../core/costs/types'
import { calculateCosts } from '../../core/costs/calculateCosts'
import type { MissingCostPolicy } from '../../core/costs/calculateCosts'
import { parseCostImport } from '../../core/costs/parseCostImport'
import { summarizeCostHistory } from '../../core/costs/summarizeCostHistory'
import { previewBulkCostEdit, type BulkCostMode } from '../../core/costs/applyBulkCostEdit'

interface Props { readonly events: readonly CanonicalFinancialEvent[]; readonly costs: readonly ProductCost[]; readonly onSave: (costs: ProductCost[]) => void; readonly missingCostPolicy: MissingCostPolicy; readonly onMissingCostPolicyChange: (policy: MissingCostPolicy) => void; readonly normalizeSku?: (sku: string) => string }
type Draft = { sku: string; unitCost: string; effectiveFrom: string }
const recordKey = (sku: string, effectiveFrom?: string | null) => `${sku}\u001f${effectiveFrom ?? ''}`

export function CostMaster({ events, costs, onSave, missingCostPolicy, onMissingCostPolicyChange, normalizeSku }: Props) {
  const status = useMemo(() => calculateCosts(events, costs, missingCostPolicy, normalizeSku), [events, costs, missingCostPolicy, normalizeSku])
  const initialDrafts = () => {
    const map: Record<string, Draft> = {}
    costs.forEach(cost => { map[recordKey(cost.sku, cost.effectiveFrom)] = { sku: cost.sku, unitCost: String(cost.unitCost), effectiveFrom: cost.effectiveFrom ?? '' } })
    status.requiredSkus.forEach(sku => { const key = recordKey(sku); if (!Object.values(map).some(item => item.sku === sku)) map[key] = { sku, unitCost: '', effectiveFrom: '' } })
    return map
  }
  const [drafts, setDrafts] = useState<Record<string, Draft>>(initialDrafts)
  const [newSku, setNewSku] = useState(''), [newCost, setNewCost] = useState(''), [newDate, setNewDate] = useState('')
  const [saved, setSaved] = useState(false), [bulkText, setBulkText] = useState(''), [importMessage, setImportMessage] = useState('')
  const [chartSku, setChartSku] = useState('')
  const [bulkSearch, setBulkSearch] = useState(''), [bulkSelection, setBulkSelection] = useState<string[]>([])
  const [bulkMode, setBulkMode] = useState<BulkCostMode>('SET'), [bulkValue, setBulkValue] = useState(''), [bulkDate, setBulkDate] = useState('')
  const [bulkOverwrite, setBulkOverwrite] = useState(false), [bulkConfirmed, setBulkConfirmed] = useState(false)
  const [undoCosts, setUndoCosts] = useState<ProductCost[] | null>(null)
  const draftCosts = useMemo(() => Object.values(drafts).flatMap(item => { const unitCost = Number(item.unitCost); return item.sku.trim() && item.unitCost.trim() && Number.isFinite(unitCost) && unitCost >= 0 ? [{ sku: item.sku.trim(), unitCost, effectiveFrom: item.effectiveFrom || null, updatedAt: costs.find(cost => recordKey(cost.sku, cost.effectiveFrom) === recordKey(item.sku, item.effectiveFrom))?.updatedAt ?? '' }] : [] }), [drafts, costs])
  const preview = useMemo(() => calculateCosts(events, draftCosts, missingCostPolicy, normalizeSku), [events, draftCosts, missingCostPolicy, normalizeSku])
  const histories = useMemo(() => summarizeCostHistory(draftCosts, normalizeSku), [draftCosts, normalizeSku])
  const selectedHistory = histories.find(item => item.sku === chartSku) ?? histories[0]
  const chartMax = Math.max(1, ...((selectedHistory?.points ?? []).map(point => point.unitCost)))
  const rows = Object.entries(drafts).sort(([, a], [, b]) => a.sku.localeCompare(b.sku) || (a.effectiveFrom || '').localeCompare(b.effectiveFrom || ''))
  const availableSkus = useMemo(() => [...new Set([...status.requiredSkus, ...draftCosts.map(cost => cost.sku)])].sort(), [status.requiredSkus, draftCosts])
  const visibleBulkSkus = availableSkus.filter(sku => sku.toLocaleLowerCase().includes(bulkSearch.trim().toLocaleLowerCase()))
  const bulkSpec = useMemo(() => ({ skus: bulkSelection, mode: bulkMode, value: bulkValue.trim() ? Number(bulkValue) : Number.NaN, effectiveFrom: bulkDate || null, overwriteConflicts: bulkOverwrite }), [bulkSelection, bulkMode, bulkValue, bulkDate, bulkOverwrite])
  const bulkPreview = useMemo(() => previewBulkCostEdit(events, draftCosts, bulkSpec, normalizeSku), [events, draftCosts, bulkSpec, normalizeSku])

  function persist(next: readonly ProductCost[]) { const now = new Date().toISOString(); const savedCosts = next.map(cost => ({ ...cost, updatedAt: cost.updatedAt || now })).sort((a, b) => a.sku.localeCompare(b.sku) || (a.effectiveFrom ?? '').localeCompare(b.effectiveFrom ?? '')); onSave(savedCosts); setSaved(true) }
  function save() { persist(draftCosts) }
  function addPeriod() {
    const sku = newSku.trim(), value = Number(newCost)
    if (!sku || !newCost.trim() || !Number.isFinite(value) || value < 0) return
    const key = recordKey(sku, newDate)
    if (drafts[key]) { setImportMessage(`${sku} already has a cost for ${newDate || 'the default fallback'}. Edit that row instead.`); return }
    setDrafts(current => ({ ...current, [key]: { sku, unitCost: String(value), effectiveFrom: newDate } }))
    setNewSku(''); setNewCost(''); setNewDate(''); setSaved(false)
  }
  function changeEffectiveDate(key: string, item: Draft, effectiveFrom: string) {
    const target = recordKey(item.sku, effectiveFrom)
    if (target !== key && drafts[target]) { setImportMessage(`${item.sku} already has a cost for ${effectiveFrom || 'the default fallback'}. Remove or edit that row first.`); return }
    const changed = { ...item, effectiveFrom }
    setDrafts(current => { const next = { ...current }; delete next[key]; next[target] = changed; return next })
    setSaved(false)
  }
  function importText(text: string) {
    const result = parseCostImport(text), now = new Date().toISOString()
    if (result.costs.length) {
      const nextDrafts = { ...drafts }
      result.costs.forEach(cost => { nextDrafts[recordKey(cost.sku, cost.effectiveFrom)] = { sku: cost.sku, unitCost: String(cost.unitCost), effectiveFrom: cost.effectiveFrom ?? '' } })
      setDrafts(nextDrafts)
      const merged = new Map(costs.map(cost => [recordKey(cost.sku, cost.effectiveFrom), cost]))
      result.costs.forEach(cost => merged.set(recordKey(cost.sku, cost.effectiveFrom), { ...cost, updatedAt: now }))
      persist([...merged.values()])
    }
    setImportMessage(`${result.costs.length} costs imported and saved${result.issues.length ? ` · ${result.issues.length} issues: ${result.issues.slice(0, 2).join(' ')}` : ''}`)
  }
  function draftsFromCosts(nextCosts: readonly ProductCost[]) {
    const next: Record<string, Draft> = {}
    nextCosts.forEach(cost => { next[recordKey(cost.sku, cost.effectiveFrom)] = { sku: cost.sku, unitCost: String(cost.unitCost), effectiveFrom: cost.effectiveFrom ?? '' } })
    status.requiredSkus.forEach(sku => { if (!Object.values(next).some(item => item.sku === sku)) next[recordKey(sku)] = { sku, unitCost: '', effectiveFrom: '' } })
    return next
  }
  function applyBulk() {
    if (!bulkPreview.valid || !bulkConfirmed) return
    setUndoCosts([...draftCosts])
    setDrafts(draftsFromCosts(bulkPreview.costs))
    persist(bulkPreview.costs)
    setBulkConfirmed(false)
    setImportMessage(`${bulkPreview.changes.length} SKU costs updated and saved.`)
  }
  function undoBulk() {
    if (!undoCosts) return
    setDrafts(draftsFromCosts(undoCosts)); persist(undoCosts); setUndoCosts(null); setImportMessage('Latest bulk cost update was undone.')
  }

  return <section className="panel cost-master">
    <div className="panel-head"><div><small>Products</small><h3>Product Cost History</h3><p>Use effective dates when unit costs change. Each sale uses the newest cost active on its sale date; an undated record is the safe fallback.</p></div><span className={status.complete ? 'status quality-good' : 'status warning'}>{status.coveredSkus}/{status.requiredSkus.length} imported SKUs covered</span></div>
    <div className="coverage-track"><i style={{ width: `${status.coveragePercent}%` }} /></div>
    <label className="cost-policy"><input type="checkbox" checked={missingCostPolicy === 'ASSUME_ZERO'} onChange={event => onMissingCostPolicyChange(event.target.checked ? 'ASSUME_ZERO' : 'BLOCK')} /><span><strong>Assume ₹0 for missing cost periods</strong><small>Profit stays marked as estimated when a SKU has no cost active on the transaction date.</small></span></label>
    <section className={`cost-preview ${preview.missingEventCount ? 'warning' : 'good'}`}><div><small>Profit impact preview</small><strong>Net COGS: {preview.netCogs.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</strong><span>{preview.netCogs === status.netCogs ? 'No unsaved COGS change' : `${(preview.netCogs - status.netCogs).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} versus saved costs`}</span></div><div><small>Date coverage</small><strong>{preview.missingEventCount ? `${preview.missingEventCount} transactions lack an active cost` : 'Every transaction has an active cost'}</strong><span>{preview.missingSkus.length ? preview.missingSkus.join(', ') : 'Historical profit is ready'}</span></div></section>
    <details className="bulk-costs" open><summary>Bulk import cost history</summary><p>Upload or paste <strong>SKU</strong>, <strong>Unit Cost</strong>, and optional <strong>Effective From</strong> in YYYY-MM-DD format. Leave the date blank to create a default fallback.</p><div className="bulk-actions"><label className="secondary file-action">Choose CSV/TSV<input hidden type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) importText(await file.text()) }} /></label></div><textarea value={bulkText} onChange={event => setBulkText(event.target.value)} placeholder={'SKU\tUnit Cost\tEffective From\nSKU-001\t125.50\t2026-01-01'} /><button className="secondary" disabled={!bulkText.trim()} onClick={() => importText(bulkText)}>Import pasted costs</button>{importMessage ? <p className="import-message" role="status">{importMessage}</p> : null}</details>
    <details className="bulk-editor"><summary><span><strong>Bulk edit selected SKUs</strong><small>Set one cost or adjust existing costs together</small></span><b>{bulkSelection.length} selected</b></summary><div className="bulk-editor-body"><div className="bulk-sku-picker"><header><input aria-label="Search SKUs for bulk editing" placeholder="Search SKU" value={bulkSearch} onChange={event => setBulkSearch(event.target.value)} /><span><button className="text-btn" onClick={() => setBulkSelection([...new Set([...bulkSelection, ...visibleBulkSkus])])}>Select visible</button><button className="text-btn" onClick={() => setBulkSelection([])}>Clear</button></span></header><div>{visibleBulkSkus.map(sku => <label key={sku}><input type="checkbox" checked={bulkSelection.includes(sku)} onChange={event => setBulkSelection(current => event.target.checked ? [...current, sku] : current.filter(item => item !== sku))} /><span>{sku}</span></label>)}</div></div><div className="bulk-edit-spec"><label>Change type<select value={bulkMode} onChange={event => { setBulkMode(event.target.value as BulkCostMode); setBulkConfirmed(false) }}><option value="SET">Set unit cost</option><option value="INCREASE_PERCENT">Increase by %</option><option value="DECREASE_PERCENT">Decrease by %</option></select></label><label>{bulkMode === 'SET' ? 'Unit cost' : 'Percentage'}<input inputMode="decimal" value={bulkValue} onChange={event => { setBulkValue(event.target.value); setBulkConfirmed(false) }} placeholder="0.00" /></label><label>Effective from <small>Blank updates fallback</small><input type="date" value={bulkDate} onChange={event => { setBulkDate(event.target.value); setBulkConfirmed(false) }} /></label><section className={bulkPreview.valid ? 'bulk-impact good' : 'bulk-impact warning'}><small>Impact preview</small><strong>{bulkPreview.changes.length} SKU{bulkPreview.changes.length === 1 ? '' : 's'} · COGS {bulkPreview.netCogsChange >= 0 ? '+' : ''}{bulkPreview.netCogsChange.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</strong>{bulkPreview.conflicts.length ? <span>{bulkPreview.conflicts.length} existing period{bulkPreview.conflicts.length === 1 ? '' : 's'} would be replaced</span> : null}{bulkPreview.missingBaseSkus.length ? <span>No base cost: {bulkPreview.missingBaseSkus.join(', ')}</span> : null}{bulkPreview.changes.length ? <div className="bulk-change-list">{bulkPreview.changes.slice(0, 12).map(change => <div key={change.sku}><b>{change.sku}</b><span>{change.previousCost === null ? 'No cost' : change.previousCost.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} → {change.nextCost.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span><i>{change.effectiveFrom ?? 'Default'}</i></div>)}{bulkPreview.changes.length > 12 ? <small>+{bulkPreview.changes.length - 12} more selected SKUs</small> : null}</div> : null}</section>{bulkPreview.conflicts.length ? <label className="bulk-confirm"><input type="checkbox" checked={bulkOverwrite} onChange={event => { setBulkOverwrite(event.target.checked); setBulkConfirmed(false) }} />Replace existing costs for this date</label> : null}<label className="bulk-confirm"><input type="checkbox" checked={bulkConfirmed} onChange={event => setBulkConfirmed(event.target.checked)} />I reviewed the selected SKUs and COGS impact</label><div className="bulk-edit-actions"><button className="primary" disabled={!bulkPreview.valid || !bulkConfirmed} onClick={applyBulk}>Apply and save</button>{undoCosts ? <button className="secondary" onClick={undoBulk}>Undo latest bulk update</button> : null}</div></div></div></details>
    <div className="cost-period-add"><label>SKU<input placeholder="SKU-001" value={newSku} onChange={event => setNewSku(event.target.value)} /></label><label>Unit cost<input inputMode="decimal" placeholder="0.00" value={newCost} onChange={event => setNewCost(event.target.value)} /></label><label>Effective from <small>Optional fallback</small><input type="date" value={newDate} onChange={event => setNewDate(event.target.value)} /></label><button className="secondary" disabled={!newSku.trim() || !newCost.trim()} onClick={addPeriod}>Add cost period</button></div>
    {selectedHistory ? <section className="cost-history-chart" aria-label="Cost history chart"><header><div><small>Cost trend</small><strong>{selectedHistory.sku}</strong><span>{selectedHistory.points.length} cost {selectedHistory.points.length === 1 ? 'period' : 'periods'}</span></div><label>View SKU<select value={selectedHistory.sku} onChange={event => setChartSku(event.target.value)}>{histories.map(item => <option key={item.sku}>{item.sku}</option>)}</select></label></header><div className="cost-history-bars">{selectedHistory.points.map((point, index) => <div key={`${point.effectiveFrom ?? 'default'}-${index}`}><span>{point.effectiveFrom ?? 'Default fallback'}</span><i><b style={{ width: `${point.unitCost / chartMax * 100}%` }} /></i><strong>{point.unitCost.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</strong></div>)}</div><footer><span>First-to-current change</span><strong className={selectedHistory.absoluteChange > 0 ? 'cost-up' : selectedHistory.absoluteChange < 0 ? 'cost-down' : ''}>{selectedHistory.absoluteChange > 0 ? '+' : ''}{selectedHistory.absoluteChange.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}{selectedHistory.changePercent === null ? '' : ` (${selectedHistory.changePercent > 0 ? '+' : ''}${selectedHistory.changePercent}%)`}</strong></footer></section> : null}
    <div className="table-scroll"><table className="cost-history-table"><thead><tr><th>SKU</th><th>Effective from</th><th>Unit cost</th><th>Coverage</th><th>Last saved</th><th /></tr></thead><tbody>{!rows.length ? <tr><td colSpan={6}>Import a report or add a cost period to begin.</td></tr> : rows.map(([key, item]) => { const existing = costs.find(cost => recordKey(cost.sku, cost.effectiveFrom) === key); const skuMissing = preview.missingSkus.includes(item.sku); return <tr key={key}><td><strong>{item.sku}</strong></td><td><input aria-label={`${item.sku} effective from`} type="date" value={item.effectiveFrom} onChange={event => changeEffectiveDate(key, item, event.target.value)} /></td><td><div className="money-input"><b>₹</b><input aria-label={`${item.sku} unit cost`} inputMode="decimal" value={item.unitCost} onChange={event => { setDrafts(current => ({ ...current, [key]: { ...item, unitCost: event.target.value } })); setSaved(false) }} placeholder="0.00" /></div></td><td>{skuMissing ? <span className="quality-warn">Date gap</span> : item.unitCost ? <span className="quality-good">Active</span> : <span className="quality-warn">Missing</span>}</td><td>{existing?.updatedAt ? new Date(existing.updatedAt).toLocaleDateString('en-IN') : 'Unsaved'}</td><td><button className="text-btn danger-text" onClick={() => { setDrafts(current => { const next = { ...current }; delete next[key]; return next }); setSaved(false) }}>Remove</button></td></tr> })}</tbody></table></div>
    <div className="cost-actions"><span>{saved ? '✓ Cost history saved in this browser' : 'Review the COGS preview, then save changes.'}</span><button className="primary" onClick={save}>Save cost history</button></div>
  </section>
}
