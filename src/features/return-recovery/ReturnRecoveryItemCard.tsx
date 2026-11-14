import type { ReturnInspectionRecord, FinancialRecoveryResult } from '../../core/return-recovery/types'
import { ReturnItemStateBadge, RecoveryStatusBadge } from './ReturnRecoveryBadge'

export interface ReturnRecoveryItemCardProps {
  readonly orderId: string
  readonly sku: string
  readonly asin?: string | null
  readonly productTitle?: string | null
  readonly productImage?: string | null
  readonly returnedQuantity: number
  readonly returnDate?: string | null
  readonly financialNet: number
  readonly consumedCost: number | null
  readonly inspection?: ReturnInspectionRecord | null
  readonly financialResult?: FinancialRecoveryResult | null
  readonly formatMoney?: (amount: number) => string
  readonly onInspect: () => void
}

export function ReturnRecoveryItemCard({
  orderId,
  sku,
  asin,
  productTitle,
  productImage,
  returnedQuantity,
  returnDate,
  financialNet,
  consumedCost,
  inspection,
  financialResult,
  formatMoney = (val: number) => `₹${val.toLocaleString('en-IN')}`,
  onInspect,
}: ReturnRecoveryItemCardProps) {
  const dispositions = inspection?.dispositions ?? []
  const overallStatus = financialResult?.status ?? inspection?.overallStatus ?? 'PROVISIONAL'

  return (
    <article className="recovery-item-card" aria-label={`Return for order ${orderId}`}>
      <header className="recovery-card-header">
        <div className="recovery-card-title-group">
          <span className="recovery-order-id">{orderId}</span>
          {returnDate ? <span className="recovery-order-date">{returnDate}</span> : null}
        </div>
        <RecoveryStatusBadge status={overallStatus} />
      </header>

      <div className="recovery-card-body">
        <div className="recovery-card-product">
          {productImage ? (
            <img src={productImage} alt={productTitle ?? sku} className="recovery-thumb-small" />
          ) : (
            <div className="recovery-thumb-small recovery-thumb-empty">📦</div>
          )}
          <div className="recovery-card-details">
            <span className="recovery-card-sku">{sku}</span>
            {asin ? <span className="recovery-card-asin">ASIN: {asin}</span> : null}
            {productTitle ? <span className="recovery-card-title">{productTitle}</span> : null}
          </div>
        </div>

        <div className="recovery-card-dispositions">
          <span className="recovery-disp-label">Returned: <strong>{returnedQuantity} unit(s)</strong></span>
          <div className="recovery-badge-list">
            {dispositions.length > 0 ? (
              dispositions.map(d => (
                <div key={d.id} className="recovery-badge-item">
                  <ReturnItemStateBadge state={d.state} />
                  <span className="recovery-badge-qty">{d.quantity} unit(s)</span>
                  {d.state === 'REPAIRABLE' && d.repairConfirmed && d.repairExpense !== null && d.repairExpense > 0 ? (
                    <small className="recovery-repair-tag">Repair: {formatMoney(d.repairExpense)}</small>
                  ) : null}
                  {d.reimbursementClaimRecommended ? (
                    <small className="recovery-claim-tag" title={d.reimbursementClaimReason ?? 'Claim recommended'}>
                      SAFE-T claim
                    </small>
                  ) : null}
                </div>
              ))
            ) : (
              <ReturnItemStateBadge state="AWAITING_INSPECTION" />
            )}
          </div>
        </div>

        <div className="recovery-financial-strip">
          <div className="recovery-strip-col">
            <small>Marketplace Net</small>
            <span>{formatMoney(financialNet)}</span>
          </div>
          <div className="recovery-strip-col">
            <small>Product Cost</small>
            <span>{consumedCost !== null ? formatMoney(consumedCost) : 'Unknown'}</span>
          </div>
          <div className="recovery-strip-col">
            <small>Recovered Asset</small>
            <span className="recovery-text-positive">
              {financialResult ? formatMoney(financialResult.confirmedRecoveredCost) : '—'}
            </span>
          </div>
          <div className="recovery-strip-col">
            <small>Effective Net</small>
            <strong className={financialResult?.effectiveNetProfit && financialResult.effectiveNetProfit >= 0 ? 'recovery-text-positive' : 'recovery-text-negative'}>
              {financialResult?.effectiveNetProfit !== null && financialResult?.effectiveNetProfit !== undefined
                ? formatMoney(financialResult.effectiveNetProfit)
                : '—'}
            </strong>
          </div>
        </div>
      </div>

      <footer className="recovery-card-footer">
        <button type="button" className="secondary recovery-action-btn" onClick={onInspect}>
          {inspection ? 'Edit inspection' : 'Inspect return'}
        </button>
      </footer>
    </article>
  )
}
