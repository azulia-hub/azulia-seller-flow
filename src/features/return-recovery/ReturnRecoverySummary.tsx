import type { RecoveryPortfolioSummary } from '../../core/return-recovery/financialRecovery'

export interface ReturnRecoverySummaryProps {
  readonly summary: RecoveryPortfolioSummary
  readonly activeTab?: 'ALL' | 'UNCONFIRMED' | 'REPAIRABLE' | 'DAMAGED_LOST' | 'REIMBURSEMENT_REVIEW'
  readonly onSelectTab?: (tab: 'ALL' | 'UNCONFIRMED' | 'REPAIRABLE' | 'DAMAGED_LOST' | 'REIMBURSEMENT_REVIEW') => void
  readonly formatMoney?: (amount: number) => string
}

export function ReturnRecoverySummary({
  summary,
  activeTab = 'ALL',
  onSelectTab,
  formatMoney = (val: number) => `₹${val.toLocaleString('en-IN')}`,
}: ReturnRecoverySummaryProps) {
  return (
    <section className="recovery-summary-section" aria-label="Return recovery overview">
      <div className="recovery-kpi-grid">
        <div className="recovery-kpi-card">
          <span className="recovery-kpi-label">Return Items</span>
          <span className="recovery-kpi-value">{summary.totalReturnItems.toLocaleString('en-IN')}</span>
          <span className="recovery-kpi-hint">
            {summary.confirmedItemsCount} confirmed · {summary.provisionalItemsCount} provisional
          </span>
        </div>

        <div className="recovery-kpi-card recovery-kpi-positive">
          <span className="recovery-kpi-label">Recovered Inventory Value</span>
          <span className="recovery-kpi-value">{formatMoney(summary.totalConfirmedRecoveredCost)}</span>
          <span className="recovery-kpi-hint">Confirmed restored to stock</span>
        </div>

        <div className="recovery-kpi-card recovery-kpi-negative">
          <span className="recovery-kpi-label">Repair Expenses</span>
          <span className="recovery-kpi-value">{formatMoney(summary.totalRepairExpense)}</span>
          <span className="recovery-kpi-hint">
            {summary.unconfirmedRepairItemsCount > 0
              ? `${summary.unconfirmedRepairItemsCount} item(s) pending repair cost`
              : 'All repair costs recorded'}
          </span>
        </div>

        <div className="recovery-kpi-card recovery-kpi-accent">
          <span className="recovery-kpi-label">Net Recovery Profit</span>
          <span className="recovery-kpi-value">
            {summary.totalEffectiveNetProfit !== null ? formatMoney(summary.totalEffectiveNetProfit) : '—'}
          </span>
          <span className="recovery-kpi-hint">
            {summary.missingCostItemsCount > 0
              ? `${summary.missingCostItemsCount} item(s) missing unit cost`
              : 'Marketplace net − cost + recovered − repairs'}
          </span>
        </div>
      </div>

      {onSelectTab ? (
        <div className="recovery-tabs-bar" role="tablist" aria-label="Return categories">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ALL'}
            className={`recovery-tab ${activeTab === 'ALL' ? 'recovery-tab-active' : ''}`}
            onClick={() => onSelectTab('ALL')}
          >
            All Returns ({summary.totalReturnItems})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'UNCONFIRMED'}
            className={`recovery-tab ${activeTab === 'UNCONFIRMED' ? 'recovery-tab-active' : ''}`}
            onClick={() => onSelectTab('UNCONFIRMED')}
          >
            Awaiting / Provisional ({summary.provisionalItemsCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'REPAIRABLE'}
            className={`recovery-tab ${activeTab === 'REPAIRABLE' ? 'recovery-tab-active' : ''}`}
            onClick={() => onSelectTab('REPAIRABLE')}
          >
            Repairable ({summary.unconfirmedRepairItemsCount > 0 ? `⚠️ ${summary.unconfirmedRepairItemsCount}` : '0'})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'DAMAGED_LOST'}
            className={`recovery-tab ${activeTab === 'DAMAGED_LOST' ? 'recovery-tab-active' : ''}`}
            onClick={() => onSelectTab('DAMAGED_LOST')}
          >
            Damaged & Lost
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'REIMBURSEMENT_REVIEW'}
            className={`recovery-tab ${activeTab === 'REIMBURSEMENT_REVIEW' ? 'recovery-tab-active' : ''}`}
            onClick={() => onSelectTab('REIMBURSEMENT_REVIEW')}
          >
            SAFE-T / Claim Review
          </button>
        </div>
      ) : null}
    </section>
  )
}
