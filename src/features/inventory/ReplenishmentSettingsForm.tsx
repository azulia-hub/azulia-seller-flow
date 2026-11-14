import React, { useState, useEffect, useRef } from 'react'
import type { ReplenishmentConfig } from '../../core/inventory/types'
import { DEFAULT_REPLENISHMENT_CONFIG } from '../../core/inventory/replenishment'

interface Props {
  readonly displaySku?:string
  readonly sku: string
  readonly productTitle?: string | null
  readonly initialConfig?: Partial<ReplenishmentConfig> | null
  readonly onSave: (sku: string, config: ReplenishmentConfig) => void | Promise<void>
  readonly onClose: () => void
}

export const ReplenishmentSettingsForm: React.FC<Props> = ({
  sku,displaySku,
  productTitle,
  initialConfig,
  onSave,
  onClose,
}) => {
  const merged: ReplenishmentConfig = {
    ...DEFAULT_REPLENISHMENT_CONFIG,
    ...initialConfig,
  }

  const [leadTimeDays, setLeadTimeDays] = useState(merged.leadTimeDays)
  const [safetyStockDays, setSafetyStockDays] = useState(merged.safetyStockDays)
  const [coverageDays, setCoverageDays] = useState(merged.replenishmentCoverageDays)
  const [moq, setMoq] = useState(merged.minOrderQuantity ?? 0)
  const [packMultiple, setPackMultiple] = useState(merged.packMultiple ?? 1)

  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close()},[])
  const [saveError,setSaveError]=useState('')
  const [saving,setSaving]=useState(false)
  const [arrivalConfirmed,setArrivalConfirmed]=useState(merged.inboundArrivalConfirmed??false)
  const [includeShipped, setIncludeShipped] = useState(merged.includeInboundShipped ?? false)
  const [includeReceiving, setIncludeReceiving] = useState(merged.includeInboundReceiving ?? false)
  const [includeWorking, setIncludeWorking] = useState(merged.includeInboundWorking ?? false)
  const [includeManual, setIncludeManual] = useState(merged.includeManualPhysical ?? false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if(saving)return
    setSaving(true);setSaveError('')
    try { await onSave(sku, {
      leadTimeDays: Math.max(0, Number(leadTimeDays) || 0),
      safetyStockDays: Math.max(0, Number(safetyStockDays) || 0),
      replenishmentCoverageDays: Math.max(1, Number(coverageDays) || 30),
      minOrderQuantity: Math.max(0, Number(moq) || 0),
      packMultiple: Math.max(1, Math.floor(Number(packMultiple) || 1)),
      includeInboundShipped: includeShipped,
      includeInboundReceiving: includeReceiving,
      includeInboundWorking: includeWorking,
      includeManualPhysical: includeManual,
      inboundArrivalConfirmed: arrivalConfirmed,
    }); onClose() } catch { setSaveError('Settings were not saved. Please retry.') } finally { setSaving(false) }
  }

  return (
    <dialog ref={dialog} onCancel={event=>{event.preventDefault();if(!saving)onClose()}}
      className="inventory-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="replenishment-settings-title"
      onMouseDown={e => {
        if (!saving && e.target === e.currentTarget) onClose()
      }}
    >
      <div className="inventory-settings-card">
        <header className="inventory-settings-header">
          <div>
            <h3 id="replenishment-settings-title">Replenishment Settings</h3>
            <p className="inventory-settings-sku">
              <strong>{displaySku??sku}</strong>
              {productTitle ? ` · ${productTitle}` : ''}
            </p>
          </div>
          <button
            type="button"
            className="inventory-close-btn"
            onClick={onClose}
            aria-label="Close replenishment settings"
          >
            ✕
          </button>
        </header>

        <form onSubmit={event=>void handleSubmit(event)} className="inventory-settings-form">
          <div className="inventory-form-grid">
            <label className="inventory-field">
              <span>Lead Time (days)</span>
              <input
                type="number"
                min="0"
                max="365"
                value={leadTimeDays}
                onChange={e => setLeadTimeDays(Number(e.target.value))}
                required
              />
              <small>Time required from purchase order until stock arrival.</small>
            </label>

            <label className="inventory-field">
              <span>Safety Stock (days)</span>
              <input
                type="number"
                min="0"
                max="180"
                value={safetyStockDays}
                onChange={e => setSafetyStockDays(Number(e.target.value))}
                required
              />
              <small>Extra buffer days for demand spikes or carrier delays.</small>
            </label>

            <label className="inventory-field">
              <span>Target Coverage (days)</span>
              <input
                type="number"
                min="1"
                max="365"
                value={coverageDays}
                onChange={e => setCoverageDays(Number(e.target.value))}
                required
              />
              <small>Cycle stock window duration to purchase for.</small>
            </label>

            <label className="inventory-field">
              <span>Min Order Quantity (MOQ)</span>
              <input
                type="number"
                min="0"
                max="100000"
                value={moq}
                onChange={e => setMoq(Number(e.target.value))}
              />
              <small>Supplier minimum purchase constraint (0 if none).</small>
            </label>

            <label className="inventory-field">
              <span>Case Pack Multiple</span>
              <input
                type="number"
                min="1"
                max="10000"
                value={packMultiple}
                onChange={e => setPackMultiple(Number(e.target.value))}
              />
              <small>Round recommendations up to nearest full carton size.</small>
            </label>
          </div>

          <fieldset className="inventory-inbound-rules">
            <legend>Qualifying Inbound &amp; Stock Count</legend>

            <label className="inventory-checkbox-label">
              <input
                type="checkbox"
                checked={includeShipped}
                onChange={e => setIncludeShipped(e.target.checked)}
              />
              <span>Include Inbound Shipped (in transit to FC)</span>
            </label>

            <label className="inventory-checkbox-label">
              <input
                type="checkbox"
                checked={includeReceiving}
                onChange={e => setIncludeReceiving(e.target.checked)}
              />
              <span>Include Inbound Receiving (currently checking in at FC)</span>
            </label>

            <label className="inventory-checkbox-label">
              <input
                type="checkbox"
                checked={includeWorking}
                onChange={e => setIncludeWorking(e.target.checked)}
              />
              <span>Include Inbound Working (draft/unshipped shipments)</span>
            </label>

            <label className="inventory-checkbox-label">
              <input
                type="checkbox"
                checked={includeManual}
                onChange={e => setIncludeManual(e.target.checked)}
              />
              <span>Include Manual Physical Stock (external warehouse)</span>
            </label>
          </fieldset>

          <label className="inventory-checkbox-label"><input type="checkbox" checked={arrivalConfirmed} onChange={event=>setArrivalConfirmed(event.target.checked)}/><span>I confirm selected inbound is expected before it is needed. This is my arrival assumption, not a verified ETA.</span></label>
          {saveError?<p role="alert">{saveError}</p>:null}
          <footer className="inventory-form-actions">
            <button type="button" className="inventory-secondary-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className="inventory-primary-btn">
              Save Settings
            </button>
          </footer>
        </form>
      </div>
    </dialog>
  )
}
