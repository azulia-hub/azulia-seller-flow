import { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import type { ProductCost } from '../core/costs/types'
import { productCostIdentity, setProductCost } from '../core/costs/setProductCost'
import { computeLandedUnitCost } from '../core/costs/landedCost'

export const ProductCostEditorContext = createContext<{
  pending?: boolean
  costs: readonly ProductCost[]
  normalizeSku?: (sku: string) => string
  preview: (record: ProductCost | null) => void
  save: (record: ProductCost) => void
  cancelPreview: () => void
  manageCosts?: () => void
} | null>(null)

export function ProductCostEditor({ sku, missingCost }: { sku: string; missingCost: boolean }) {
  const context = useContext(ProductCostEditorContext)
  const id = useId(), input = useRef<HTMLInputElement>(null)
  const records = context?.costs.filter(cost => productCostIdentity(cost.sku, context.normalizeSku) === productCostIdentity(sku, context.normalizeSku)) ?? []
  const fallback = records.find(record => !record.effectiveFrom)
  const hasHistory = records.some(record => record.effectiveFrom)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [purchase, setPurchase] = useState('')
  const [packaging, setPackaging] = useState('')
  const [freight, setFreight] = useState('')
  const [taxCredit, setTaxCredit] = useState('')
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => () => context?.cancelPreview(), [sku])
  useEffect(() => { if (editing) { input.current?.focus(); input.current?.select() } }, [editing])
  if (!context) return null
  function edit() {
    setValue(fallback ? String(fallback.unitCost) : '')
    setPurchase(fallback?.purchaseCost !== undefined && fallback?.purchaseCost !== null ? String(fallback.purchaseCost) : '')
    setPackaging(fallback?.packagingCost !== undefined && fallback?.packagingCost !== null ? String(fallback.packagingCost) : '')
    setFreight(fallback?.freightCost !== undefined && fallback?.freightCost !== null ? String(fallback.freightCost) : '')
    setTaxCredit(fallback?.taxCreditOffset !== undefined && fallback?.taxCreditOffset !== null ? String(fallback.taxCreditOffset) : '')
    setShowBreakdown(Boolean(fallback?.purchaseCost || fallback?.packagingCost || fallback?.freightCost || fallback?.taxCreditOffset))
    setEditing(true); setDirty(false); setError(''); setMessage('')
  }
  function updateFromBreakdown(p: string, pkg: string, f: string, tc: string) {
    const total = computeLandedUnitCost({
      purchaseCost: p ? Number(p) : null,
      packagingCost: pkg ? Number(pkg) : null,
      freightCost: f ? Number(f) : null,
      taxCreditOffset: tc ? Number(tc) : null,
    }, Number(value) || 0)
    draft(String(total), p, pkg, f, tc)
  }
  function draft(nextValue: string, p = purchase, pkg = packaging, f = freight, tc = taxCredit) {
    setValue(nextValue); setDirty(true); setMessage(''); setError('')
    if (!nextValue.trim()) { context!.preview(null); return }
    const record: ProductCost = {
      sku,
      unitCost: Number(nextValue),
      purchaseCost: p ? Number(p) : null,
      packagingCost: pkg ? Number(pkg) : null,
      freightCost: f ? Number(f) : null,
      taxCreditOffset: tc ? Number(tc) : null,
      effectiveFrom: null,
      updatedAt: '',
    }
    try { setProductCost(context!.costs, record, context!.normalizeSku); context!.preview(record) }
    catch (cause) { context!.preview(null); setError(cause instanceof Error ? cause.message : 'Check this cost.') }
  }
  function save() {
    if (!value.trim()) { setError('Enter a cost. A blank cost is not zero.'); return }
    try {
      context!.save({
        sku,
        unitCost: Number(value),
        purchaseCost: purchase ? Number(purchase) : null,
        packagingCost: packaging ? Number(packaging) : null,
        freightCost: freight ? Number(freight) : null,
        taxCreditOffset: taxCredit ? Number(taxCredit) : null,
        effectiveFrom: null,
        updatedAt: new Date().toISOString(),
      })
      setDirty(false); setError(''); setMessage('Saved'); setEditing(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this cost.') }
  }
  function cancel() { context!.cancelPreview(); setEditing(false); setDirty(false); setError(''); setMessage('') }
  const savedLabel = fallback ? `₹${fallback.unitCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}${hasHistory ? ' default' : ''}` : missingCost || !records.length ? 'Not added' : 'Varies'
  return <section className="compact-product-cost" aria-label="Product cost editor">
    {!editing ? <div className="compact-cost-display"><span>Unit cost: <strong>{savedLabel}</strong></span><button className="text-btn" onClick={edit}>{fallback || hasHistory ? 'Edit' : 'Add'}</button>{message ? <small role="status">{message}</small> : null}</div> : <>
      <form onSubmit={event => { event.preventDefault(); save() }} className="compact-cost-form">
        <label htmlFor={`${id}-cost`}>Unit cost (₹)</label><div className="compact-cost-input"><span aria-hidden="true">₹</span><input ref={input} id={`${id}-cost`} type="number" min="0" step="0.01" inputMode="decimal" value={value} onChange={event => draft(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel() } }} aria-describedby={`${id}-status`} /></div>
        <button className="primary" type="submit" disabled={!dirty || !value.trim() || Boolean(error)}>Save</button><button className="text-btn" type="button" onClick={cancel}>Cancel</button>
      </form>
      <button className="text-btn" type="button" style={{ fontSize: 11, margin: '4px 0' }} onClick={() => setShowBreakdown(open => !open)}>
        {showBreakdown ? 'Hide landed breakdown' : 'Landed cost breakdown (packaging, freight, tax credit)'}
      </button>
      {showBreakdown ? <div className="landed-cost-breakdown-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', margin: '6px 0', fontSize: '11px', background: 'var(--panel-alt, rgba(255,255,255,0.03))', padding: '8px', borderRadius: '6px' }}>
        <label>Purchase (₹)<input type="number" min="0" step="0.01" value={purchase} placeholder="0.00" onChange={e => { setPurchase(e.target.value); updateFromBreakdown(e.target.value, packaging, freight, taxCredit) }} /></label>
        <label>Packaging (₹)<input type="number" min="0" step="0.01" value={packaging} placeholder="0.00" onChange={e => { setPackaging(e.target.value); updateFromBreakdown(purchase, e.target.value, freight, taxCredit) }} /></label>
        <label>Freight (₹)<input type="number" min="0" step="0.01" value={freight} placeholder="0.00" onChange={e => { setFreight(e.target.value); updateFromBreakdown(purchase, packaging, e.target.value, taxCredit) }} /></label>
        <label>Tax Credit / ITC (₹)<input type="number" min="0" step="0.01" value={taxCredit} placeholder="0.00" onChange={e => { setTaxCredit(e.target.value); updateFromBreakdown(purchase, packaging, freight, e.target.value) }} /></label>
      </div> : null}
      <small id={`${id}-status`} role={error ? 'alert' : 'status'}>{error || (context.pending ? 'Updating…' : dirty && value.trim() ? 'Live preview · not saved' : 'Figures preview as you type.')}</small>
      {hasHistory ? <small className="compact-cost-history">Existing dated costs are kept.{context.manageCosts ? <button className="text-btn" onClick={context.manageCosts}>Manage cost history</button> : null}</small> : null}
    </>}
  </section>
}
