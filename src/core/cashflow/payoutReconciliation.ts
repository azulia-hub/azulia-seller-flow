import { toIndiaDateString } from '../sync/planner'
import type { PayoutGroup } from './weeklyPayout'

export type SettlementCategory = 'Sales' | 'Refunds' | 'Fees' | 'Reimbursements' | 'Reserves' | 'Taxes' | 'Adjustments and unclassified'

export interface SettlementComponent {
  readonly label: string
  readonly category: SettlementCategory
  readonly amountMinor: number
}

export interface SettlementActivity {
  readonly id: string
  readonly label: string
  readonly postedAt: string
  readonly amountMinor: number | null
  readonly category?: SettlementCategory
  readonly components?: readonly SettlementComponent[]
}

export interface BankCredit {
  readonly amountMinor: number
  readonly date: string
  readonly reference: string
}

export function payoutReconciliation(group: PayoutGroup, activity: readonly SettlementActivity[], bank?: BankCredit) {
  const activityMinor = activity.length && activity.every(item => item.amountMinor !== null)
    ? activity.reduce((sum, row) => sum + (row.amountMinor ?? 0), 0) : null
  const calculated = group.openingMinor != null && activityMinor !== null ? group.openingMinor + activityMinor : null
  const transfer = !group.open && group.transferSucceeded ? group.bankTransferMinor === undefined
    ? group.amountMinor : group.bankTransferMinor : null
  const bankDifference = transfer !== null && bank ? bank.amountMinor - transfer : null
  const settlementDifference = calculated !== null && group.amountMinor !== null ? group.amountMinor - calculated : null
  const transferDate = toIndiaDateString(group.transferAt)
  const bankStatus = transfer === null || transfer <= 0 ? 'UNAVAILABLE' as const :
    !bank ? 'AWAITING' as const :
    bankDifference !== 0 ? 'DIFFERENCE' as const :
    transferDate && bank.date < transferDate ? 'DATE_REVIEW' as const : 'MATCHED' as const
  return { activityMinor, calculated, transfer, bankDifference, settlementDifference, bankStatus }
}

export function settlementActivityByCategory(activity: readonly SettlementActivity[]) {
  const groups = new Map<SettlementCategory, SettlementActivity[]>()
  for (const row of activity) {
    const components = row.components
    const balanced = components?.length && components.reduce((sum, part) => sum + part.amountMinor, 0) === row.amountMinor
    const parts = balanced ? components.map((part, index) => ({
      ...row, ...part, id: `${row.id}:${index}`, label: `${row.label} / ${part.label}`, components: undefined,
    })) : [row]
    for (const part of parts) {
      const category = part.category ?? 'Adjustments and unclassified'
      const group = groups.get(category) ?? []
      group.push(part)
      groups.set(category, group)
    }
  }
  return [...groups].map(([category, rows]) => ({
    category, rows, total: rows.every(row => row.amountMinor !== null)
      ? rows.reduce((sum, row) => sum + (row.amountMinor ?? 0), 0) : null,
  })).sort((a, b) => a.category.localeCompare(b.category))
}
