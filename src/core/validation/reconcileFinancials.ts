import type { CanonicalFinancialEvent, FinancialReconciliation } from '../data/types'

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function reconcileFinancials(
  events: readonly CanonicalFinancialEvent[],
  sourceTotal: number | null,
): FinancialReconciliation {
  const normalizedTotal = roundMoney(events.reduce((sum, event) => sum + event.amount, 0))
  const difference = sourceTotal === null ? null : roundMoney(sourceTotal - normalizedTotal)

  return {
    supported: sourceTotal !== null,
    sourceTotal,
    normalizedTotal,
    difference,
    reconciled: difference === 0,
  }
}
