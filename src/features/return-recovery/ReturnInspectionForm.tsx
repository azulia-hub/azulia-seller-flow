import { useState, useEffect } from 'react'
import type {
  ReturnItemIdentity,
  ReturnInspectionRecord,
  ReturnItemDisposition,
  ReturnItemConditionState,
} from '../../core/return-recovery/types'
import { validateDispositions } from '../../core/return-recovery/recoveryModel'

export interface ReturnInspectionFormProps {
  readonly identity: ReturnItemIdentity
  readonly returnedQuantity: number
  readonly unitCost: number | null
  readonly productTitle?: string | null
  readonly productImage?: string | null
  readonly returnDate?: string | null
  readonly currentInspection?: ReturnInspectionRecord | null
  readonly saving?: boolean
  readonly formatMoney?: (amount: number) => string
  readonly onSave: (record: ReturnInspectionRecord) => void
  readonly onClose: () => void
}

interface DispositionDraft {
  readonly id: string
  state: ReturnItemConditionState
  quantity: string
  recoveredValue: string
  useUnitCost: boolean
  repairExpense: string
  noRepairCost: boolean
  notes: string
  reimbursementClaimRecommended: boolean
  reimbursementClaimReason: string
}

function dispositionToDraft(disp: ReturnItemDisposition, defaultUnitCost: number | null): DispositionDraft {
  const isSellable = disp.state === 'SELLABLE'
  const useUnitCost = isSellable && disp.recoveredValue === null && defaultUnitCost !== null

  return {
    id: disp.id,
    state: disp.state,
    quantity: String(disp.quantity),
    recoveredValue: disp.recoveredValue !== null ? String(disp.recoveredValue) : '',
    useUnitCost,
    repairExpense: disp.repairExpense !== null ? String(disp.repairExpense) : '',
    noRepairCost: disp.repairConfirmed && disp.repairExpense === 0,
    notes: disp.notes ?? '',
    reimbursementClaimRecommended: Boolean(disp.reimbursementClaimRecommended),
    reimbursementClaimReason: disp.reimbursementClaimReason ?? '',
  }
}

export function ReturnInspectionForm(props: ReturnInspectionFormProps) {
  const {
    identity,
    returnedQuantity,
    unitCost,
    productTitle,
    productImage,
    returnDate,
    currentInspection,
    saving = false,
    formatMoney = (val: number) => `₹${val.toLocaleString('en-IN')}`,
    onSave,
    onClose,
  } = props

  // Rule: Default inspections strictly to unconfirmed AWAITING_INSPECTION; require explicit condition selection.
  const [drafts, setDrafts] = useState<DispositionDraft[]>(() => {
    if (currentInspection && currentInspection.dispositions.length > 0) {
      return currentInspection.dispositions.map(d => dispositionToDraft(d, unitCost))
    }
    return [
      {
        id: 'disp_1',
        state: 'AWAITING_INSPECTION',
        quantity: String(returnedQuantity),
        recoveredValue: '',
        useUnitCost: false,
        repairExpense: '',
        noRepairCost: false,
        notes: '',
        reimbursementClaimRecommended: false,
        reimbursementClaimReason: '',
      },
    ]
  })

  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [saving, onClose])

  const updateDraft = (id: string, patch: Partial<DispositionDraft>) => {
    setDrafts(prev => prev.map(item => (item.id === id ? { ...item, ...patch } : item)))
    setErrorMessage(null)
  }

  const addDispositionRow = () => {
    const remainingQty = Math.max(
      1,
      returnedQuantity - drafts.reduce((acc, d) => acc + (parseInt(d.quantity, 10) || 0), 0)
    )

    const newDraft: DispositionDraft = {
      id: `disp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      state: 'AWAITING_INSPECTION',
      quantity: String(remainingQty),
      recoveredValue: '',
      useUnitCost: false,
      repairExpense: '',
      noRepairCost: false,
      notes: '',
      reimbursementClaimRecommended: false,
      reimbursementClaimReason: '',
    }
    setDrafts(prev => [...prev, newDraft])
  }

  const removeDispositionRow = (id: string) => {
    if (drafts.length <= 1) return
    setDrafts(prev => prev.filter(d => d.id !== id))
  }

  const handleStateChange = (id: string, newState: ReturnItemConditionState) => {
    const target = drafts.find(d => d.id === id)
    if (!target) return

    const qty = parseInt(target.quantity, 10) || 1
    let recoveredValue = target.recoveredValue
    let useUnitCost = false

    // Preserve previously entered repair expenses; do NOT clear them when changing state
    const repairExpense = target.repairExpense
    const noRepairCost = target.noRepairCost

    if (newState === 'SELLABLE') {
      if (unitCost !== null && !recoveredValue) {
        recoveredValue = String(unitCost * qty)
        useUnitCost = true
      }
    } else if (newState === 'REPAIRABLE') {
      if (unitCost !== null && !recoveredValue) {
        recoveredValue = String(unitCost * qty)
      }
    } else if (newState === 'DAMAGED' || newState === 'WRONG_OR_MISSING' || newState === 'LOST') {
      if (!recoveredValue) recoveredValue = '0'
    } else if (newState === 'AWAITING_INSPECTION') {
      recoveredValue = ''
    }

    updateDraft(id, {
      state: newState,
      recoveredValue,
      useUnitCost,
      repairExpense,
      noRepairCost,
    })
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()

    const nowIso = new Date().toISOString()
    const builtDispositions: ReturnItemDisposition[] = []

    for (let i = 0; i < drafts.length; i++) {
      const draft = drafts[i]
      const qty = parseInt(draft.quantity.trim(), 10)

      if (!Number.isSafeInteger(qty) || qty <= 0) {
        setErrorMessage(`Row ${i + 1}: enter a valid positive quantity.`)
        return
      }

      let recoveredVal: number | null = null
      if (draft.state === 'SELLABLE' && draft.useUnitCost && unitCost !== null) {
        recoveredVal = unitCost * qty
      } else if (draft.recoveredValue.trim() !== '') {
        const parsed = Number(draft.recoveredValue.trim())
        if (Number.isFinite(parsed) && parsed >= 0) {
          recoveredVal = parsed
        } else {
          setErrorMessage(`Row ${i + 1}: enter a valid recovered inventory value or 0.`)
          return
        }
      }

      let repExpense: number | null = null
      let repConfirmed = false

      if (draft.state === 'REPAIRABLE' || draft.repairExpense.trim() !== '' || draft.noRepairCost) {
        if (draft.noRepairCost) {
          repExpense = 0
          repConfirmed = true
        } else if (draft.repairExpense.trim() !== '') {
          const parsed = Number(draft.repairExpense.trim())
          if (Number.isFinite(parsed) && parsed >= 0) {
            repExpense = parsed
            repConfirmed = true
          } else {
            setErrorMessage(`Row ${i + 1}: enter a valid repair expense or check 'No repair expense'.`)
            return
          }
        } else if (draft.state === 'REPAIRABLE') {
          // Explicit confirmation requirement for repairable condition
          setErrorMessage(
            `Row ${i + 1}: repairable items require an explicit repair expense amount or confirmation that no expense was incurred.`
          )
          return
        }
      }

      builtDispositions.push({
        id: draft.id,
        state: draft.state,
        quantity: qty,
        recoveredValue: recoveredVal,
        repairExpense: repExpense,
        repairConfirmed: repConfirmed,
        notes: draft.notes.trim() || null,
        inspectedAt: draft.state === 'AWAITING_INSPECTION' ? null : nowIso,
        reimbursementClaimRecommended: draft.reimbursementClaimRecommended,
        reimbursementClaimReason: draft.reimbursementClaimReason.trim() || null,
      })
    }

    const validation = validateDispositions(returnedQuantity, builtDispositions)
    if (!validation.valid) {
      setErrorMessage(validation.errors.join(' '))
      return
    }

    const totalAllocated = builtDispositions.reduce((acc, d) => acc + d.quantity, 0)
    const isFullyInspected =
      totalAllocated === returnedQuantity &&
      builtDispositions.every(d => d.state !== 'AWAITING_INSPECTION') &&
      builtDispositions.every(d => d.state !== 'REPAIRABLE' || d.repairConfirmed)

    const finalRecord: ReturnInspectionRecord = {
      identity,
      returnedQuantity,
      dispositions: builtDispositions,
      overallStatus: isFullyInspected ? 'CONFIRMED' : 'PROVISIONAL',
      updatedAt: nowIso,
      version: (currentInspection?.version ?? 0) + 1,
    }

    onSave(finalRecord)
  }

  const totalAllocatedUnits = drafts.reduce((sum, d) => sum + (parseInt(d.quantity, 10) || 0), 0)

  return (
    <div className="recovery-modal-backdrop" role="presentation" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="recovery-modal-card" role="dialog" aria-modal="true" aria-labelledby="inspection-form-title">
        <header className="recovery-modal-header">
          <div>
            <h2 id="inspection-form-title">Physical Return Inspection</h2>
            <p className="recovery-modal-subtitle">
              Order {identity.orderId} · SKU {identity.sku}
            </p>
          </div>
          <button type="button" className="recovery-icon-button" aria-label="Close" onClick={onClose} disabled={saving}>
            ✕
          </button>
        </header>

        <section className="recovery-product-context">
          {productImage ? (
            <img src={productImage} alt={productTitle ?? identity.sku} className="recovery-product-thumb" />
          ) : (
            <div className="recovery-product-thumb recovery-product-thumb-empty">📦</div>
          )}
          <div className="recovery-product-info">
            <span className="recovery-product-name">{productTitle || identity.sku}</span>
            <div className="recovery-context-pills">
              <span>Returned: <strong>{returnedQuantity} unit(s)</strong></span>
              <span>Unit cost: <strong>{unitCost !== null ? formatMoney(unitCost) : 'Unknown'}</strong></span>
              {returnDate ? <span>Date: {returnDate}</span> : null}
            </div>
          </div>
        </section>

        {errorMessage ? (
          <div className="recovery-alert recovery-alert-error" role="alert">
            {errorMessage}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="recovery-form">
          <div className="recovery-dispositions-list">
            {drafts.map((draft, index) => {
              const qty = parseInt(draft.quantity, 10) || 0
              const rowApplicableCost = unitCost !== null ? unitCost * qty : null

              return (
                <div key={draft.id} className="recovery-disposition-card">
                  <div className="recovery-disposition-header">
                    <strong>Item Group #{index + 1}</strong>
                    {drafts.length > 1 ? (
                      <button
                        type="button"
                        className="text-btn recovery-danger-btn"
                        onClick={() => removeDispositionRow(draft.id)}
                        disabled={saving}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>

                  <div className="recovery-form-grid">
                    <label className="recovery-form-field">
                      <span>Condition / Disposition</span>
                      <select
                        value={draft.state}
                        disabled={saving}
                        onChange={e => handleStateChange(draft.id, e.target.value as ReturnItemConditionState)}
                      >
                        <option value="AWAITING_INSPECTION">Awaiting inspection (Unconfirmed)</option>
                        <option value="SELLABLE">Sellable (Restored to stock)</option>
                        <option value="REPAIRABLE">Repairable (Requires reconditioning)</option>
                        <option value="DAMAGED">Damaged / Unsellable</option>
                        <option value="WRONG_OR_MISSING">Wrong / Missing contents</option>
                        <option value="LOST">Lost in transit (Courier loss)</option>
                      </select>
                    </label>

                    <label className="recovery-form-field">
                      <span>Units</span>
                      <input
                        type="number"
                        min="1"
                        max={returnedQuantity}
                        step="1"
                        value={draft.quantity}
                        disabled={saving}
                        onChange={e => updateDraft(draft.id, { quantity: e.target.value })}
                        required
                      />
                    </label>
                  </div>

                  {draft.state === 'SELLABLE' ? (
                    <div className="recovery-condition-section">
                      <label className="recovery-checkbox-label">
                        <input
                          type="checkbox"
                          checked={draft.useUnitCost}
                          disabled={saving || unitCost === null}
                          onChange={e => {
                            const checked = e.target.checked
                            updateDraft(draft.id, {
                              useUnitCost: checked,
                              recoveredValue: checked && rowApplicableCost !== null ? String(rowApplicableCost) : draft.recoveredValue,
                            })
                          }}
                        />
                        <span>
                          Restore full product unit cost ({rowApplicableCost !== null ? formatMoney(rowApplicableCost) : 'Unknown'})
                        </span>
                      </label>
                      {!draft.useUnitCost ? (
                        <label className="recovery-form-field">
                          <span>Explicit Recovered Asset Value</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={draft.recoveredValue}
                            disabled={saving}
                            placeholder="Enter value"
                            onChange={e => updateDraft(draft.id, { recoveredValue: e.target.value })}
                          />
                        </label>
                      ) : null}

                      {draft.repairExpense ? (
                        <div className="recovery-retained-repair-note">
                          <span>Recorded repair expense: <strong>{formatMoney(Number(draft.repairExpense))}</strong></span>
                          <button
                            type="button"
                            className="text-btn"
                            onClick={() => updateDraft(draft.id, { repairExpense: '', noRepairCost: true })}
                          >
                            Clear expense
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {draft.state === 'REPAIRABLE' ? (
                    <div className="recovery-condition-section">
                      <label className="recovery-form-field">
                        <span>Recovered Value After Repair</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft.recoveredValue}
                          disabled={saving}
                          placeholder={rowApplicableCost !== null ? String(rowApplicableCost) : '0'}
                          onChange={e => updateDraft(draft.id, { recoveredValue: e.target.value })}
                        />
                      </label>

                      <div className="recovery-repair-block">
                        <label className="recovery-checkbox-label">
                          <input
                            type="checkbox"
                            checked={draft.noRepairCost}
                            disabled={saving}
                            onChange={e => {
                              const checked = e.target.checked
                              updateDraft(draft.id, {
                                noRepairCost: checked,
                                repairExpense: checked ? '0' : draft.repairExpense,
                              })
                            }}
                          />
                          <span>No repair expense incurred (₹0)</span>
                        </label>

                        {!draft.noRepairCost ? (
                          <label className="recovery-form-field">
                            <span>Repair / Reconditioning Expense</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={draft.repairExpense}
                              disabled={saving}
                              placeholder="Enter repair cost"
                              onChange={e => updateDraft(draft.id, { repairExpense: e.target.value })}
                              required={!draft.noRepairCost}
                            />
                            <small className="recovery-field-hint">
                              Must explicitly confirm repair expense. Silently assuming ₹0 is prohibited.
                            </small>
                          </label>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {draft.state === 'DAMAGED' || draft.state === 'WRONG_OR_MISSING' || draft.state === 'LOST' ? (
                    <div className="recovery-condition-section">
                      <label className="recovery-form-field">
                        <span>Salvage / Scrap Value (if sold or salvaged)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft.recoveredValue}
                          disabled={saving}
                          placeholder="0"
                          onChange={e => updateDraft(draft.id, { recoveredValue: e.target.value })}
                        />
                      </label>

                      <label className="recovery-checkbox-label">
                        <input
                          type="checkbox"
                          checked={draft.reimbursementClaimRecommended}
                          disabled={saving}
                          onChange={e => updateDraft(draft.id, { reimbursementClaimRecommended: e.target.checked })}
                        />
                        <span>Flag for Amazon SAFE-T / Courier Damage claim</span>
                      </label>

                      {draft.reimbursementClaimRecommended ? (
                        <label className="recovery-form-field">
                          <span>Claim Reason / Evidence Note</span>
                          <input
                            type="text"
                            value={draft.reimbursementClaimReason}
                            disabled={saving}
                            placeholder="e.g. Broken packaging, customer switched item, transit loss"
                            onChange={e => updateDraft(draft.id, { reimbursementClaimReason: e.target.value })}
                          />
                        </label>
                      ) : null}
                    </div>
                  ) : null}

                  <label className="recovery-form-field">
                    <span>Inspection Notes (optional)</span>
                    <input
                      type="text"
                      value={draft.notes}
                      disabled={saving}
                      placeholder="Condition notes, serial number, or damage details"
                      onChange={e => updateDraft(draft.id, { notes: e.target.value })}
                    />
                  </label>
                </div>
              )
            })}
          </div>

          {totalAllocatedUnits < returnedQuantity ? (
            <div className="recovery-form-actions-inline">
              <button type="button" className="secondary text-btn" onClick={addDispositionRow} disabled={saving}>
                + Add condition group for remaining {returnedQuantity - totalAllocatedUnits} unit(s)
              </button>
            </div>
          ) : null}

          <footer className="recovery-modal-footer">
            <div className="recovery-footer-status">
              <span>
                Allocated: <strong>{totalAllocatedUnits}</strong> of {returnedQuantity} unit(s)
              </span>
            </div>
            <div className="recovery-footer-buttons">
              <button type="button" className="secondary" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={saving || totalAllocatedUnits > returnedQuantity}>
                {saving ? 'Saving…' : 'Save Inspection'}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  )
}
