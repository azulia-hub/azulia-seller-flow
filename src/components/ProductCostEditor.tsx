import { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import type { ProductCost } from '../core/costs/types'
import { productCostIdentity, setProductCost } from '../core/costs/setProductCost'

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
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => () => context?.cancelPreview(), [sku])
  useEffect(() => { if (editing) { input.current?.focus(); input.current?.select() } }, [editing])
  if (!context) return null
  function edit() {
    setValue(fallback ? String(fallback.unitCost) : ''); setEditing(true); setDirty(false); setError(''); setMessage('')
  }
  function draft(nextValue: string) {
    setValue(nextValue); setDirty(true); setMessage(''); setError('')
    if (!nextValue.trim()) { context!.preview(null); return }
    const record = { sku, unitCost: Number(nextValue), effectiveFrom: null, updatedAt: '' }
    try { setProductCost(context!.costs, record, context!.normalizeSku); context!.preview(record) }
    catch (cause) { context!.preview(null); setError(cause instanceof Error ? cause.message : 'Check this cost.') }
  }
  function save() {
    if (!value.trim()) { setError('Enter a cost. A blank cost is not zero.'); return }
    try {
      context!.save({ sku, unitCost: Number(value), effectiveFrom: null, updatedAt: new Date().toISOString() })
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
      <small id={`${id}-status`} role={error ? 'alert' : 'status'}>{error || (context.pending ? 'Updating…' : dirty && value.trim() ? 'Live preview · not saved' : 'Figures preview as you type.')}</small>
      {hasHistory ? <small className="compact-cost-history">Existing dated costs are kept.{context.manageCosts ? <button className="text-btn" onClick={context.manageCosts}>Manage cost history</button> : null}</small> : null}
    </>}
  </section>
}
