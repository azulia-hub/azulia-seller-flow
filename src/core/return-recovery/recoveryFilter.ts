import type {
  ReturnRecoveryFilterSpec,
  ReturnInspectionRecord,
  FinancialRecoveryResult,
  ReturnItemConditionState,
} from './types'

export interface FilterableReturnItem {
  readonly orderId: string
  readonly sku: string
  readonly asin?: string | null
  readonly productTitle?: string | null
  readonly inspection?: ReturnInspectionRecord | null
  readonly financialResult?: FinancialRecoveryResult | null
}

/**
 * Pure filter function evaluating whether a return item matches a specification.
 */
export function matchesRecoveryFilter(
  item: FilterableReturnItem,
  spec: ReturnRecoveryFilterSpec
): boolean {
  // 1. Text search across order ID, SKU, ASIN, and product title
  if (spec.search && spec.search.trim()) {
    const query = spec.search.trim().toLowerCase()
    const matchesOrder = item.orderId.toLowerCase().includes(query)
    const matchesSku = item.sku.toLowerCase().includes(query)
    const matchesAsin = Boolean(item.asin && item.asin.toLowerCase().includes(query))
    const matchesTitle = Boolean(item.productTitle && item.productTitle.toLowerCase().includes(query))

    if (!matchesOrder && !matchesSku && !matchesAsin && !matchesTitle) {
      return false
    }
  }

  // 2. State filter (exact physical condition match)
  if (spec.state && spec.state !== 'ALL') {
    const targetState: ReturnItemConditionState = spec.state
    const dispositions = item.inspection?.dispositions ?? []

    if (!dispositions.length) {
      if (targetState !== 'AWAITING_INSPECTION') return false
    } else {
      const hasMatchingState = dispositions.some(d => d.state === targetState)
      if (!hasMatchingState) return false
    }
  }

  // 3. Operational status filter
  if (spec.status && spec.status !== 'ALL') {
    const dispositions = item.inspection?.dispositions ?? []

    switch (spec.status) {
      case 'UNCONFIRMED': {
        const isProvisional =
          !item.inspection ||
          item.inspection.overallStatus === 'PROVISIONAL' ||
          dispositions.some(d => d.state === 'AWAITING_INSPECTION') ||
          item.financialResult?.status === 'PROVISIONAL' ||
          item.financialResult?.status === 'UNCONFIRMED_REPAIR'
        if (!isProvisional) return false
        break
      }

      case 'REPAIRABLE': {
        const isRepairable = dispositions.some(d => d.state === 'REPAIRABLE')
        if (!isRepairable) return false
        break
      }

      case 'DAMAGED_LOST': {
        const isDamagedOrLost = dispositions.some(d =>
          d.state === 'DAMAGED' || d.state === 'LOST' || d.state === 'WRONG_OR_MISSING'
        )
        if (!isDamagedOrLost) return false
        break
      }

      case 'REIMBURSEMENT_REVIEW': {
        const needsReview = dispositions.some(d =>
          Boolean(d.reimbursementClaimRecommended) ||
          d.state === 'LOST' ||
          d.state === 'WRONG_OR_MISSING' ||
          (d.state === 'DAMAGED' && Boolean(d.reimbursementClaimReason))
        )
        if (!needsReview) return false
        break
      }
    }
  }

  return true
}

/**
 * Filter an array of items using a ReturnRecoveryFilterSpec.
 */
export function filterRecoveryItems<T extends FilterableReturnItem>(
  items: readonly T[],
  spec: ReturnRecoveryFilterSpec
): readonly T[] {
  return items.filter(item => matchesRecoveryFilter(item, spec))
}
