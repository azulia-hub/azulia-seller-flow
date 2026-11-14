import type { ReturnItemConditionState, OverallRecoveryStatus, RecoveryFinancialStatus } from '../../core/return-recovery/types'

interface StateBadgeProps {
  readonly state: ReturnItemConditionState
}

export function ReturnItemStateBadge({ state }: StateBadgeProps) {
  switch (state) {
    case 'SELLABLE':
      return <span className="recovery-badge recovery-badge-positive">Sellable</span>
    case 'REPAIRABLE':
      return <span className="recovery-badge recovery-badge-warning">Repairable</span>
    case 'DAMAGED':
      return <span className="recovery-badge recovery-badge-negative">Damaged</span>
    case 'WRONG_OR_MISSING':
      return <span className="recovery-badge recovery-badge-negative">Wrong / Missing</span>
    case 'LOST':
      return <span className="recovery-badge recovery-badge-neutral">Lost in transit</span>
    case 'AWAITING_INSPECTION':
    default:
      return <span className="recovery-badge recovery-badge-provisional">Awaiting inspection</span>
  }
}

interface StatusBadgeProps {
  readonly status: OverallRecoveryStatus | RecoveryFinancialStatus
}

export function RecoveryStatusBadge({ status }: StatusBadgeProps) {
  switch (status) {
    case 'CONFIRMED':
      return <span className="recovery-badge recovery-badge-positive">Confirmed</span>
    case 'MISSING_COST':
      return <span className="recovery-badge recovery-badge-negative" title="Product cost missing">Missing cost</span>
    case 'UNCONFIRMED_REPAIR':
      return <span className="recovery-badge recovery-badge-warning" title="Repair expense unconfirmed">Pending repair cost</span>
    case 'PROVISIONAL':
    default:
      return <span className="recovery-badge recovery-badge-provisional">Provisional</span>
  }
}
