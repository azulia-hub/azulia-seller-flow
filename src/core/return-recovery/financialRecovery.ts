import type {
  FinancialRecoveryInput,
  FinancialRecoveryResult,
  RecoveryFinancialStatus,
  RecoveryAdjustments,
} from './types'
import { round } from './recoveryModel'

export interface RecoveryPortfolioSummary {
  readonly totalReturnItems: number
  readonly totalReturnedUnits: number
  readonly confirmedItemsCount: number
  readonly provisionalItemsCount: number
  readonly missingCostItemsCount: number
  readonly unconfirmedRepairItemsCount: number
  readonly totalFinancialNet: number
  readonly totalConfirmedRecoveredCost: number
  readonly totalRepairExpense: number
  readonly totalEffectiveNetProfit: number | null
  readonly isComplete: boolean
}

/**
 * Compute the comprehensive financial outcome of a return item after physical inspection.
 *
 * MANDATORY FINANCIAL RULES:
 * 1. Financial input ALREADY includes Amazon sales, customer refunds, marketplace fees,
 *    shipping charges/reversals, and Amazon reimbursements. NEVER add reimbursements again.
 * 2. Formula: financialNet - consumedCost + confirmedRecoveredCost - repairExpense.
 * 3. Never manufacture synthetic financial events or fake ledger rows.
 * 4. Missing costs and unconfirmed repair expenses remain explicit (null).
 * 5. Identity isolation: input.identity must match recoveryCost.identity.
 * 6. Recovery ceiling: confirmedRecoveredCost cannot exceed consumedCost.
 */
export function calculateFinancialRecovery(input: FinancialRecoveryInput): FinancialRecoveryResult {
  const statusReasons: string[] = []
  const { financialNet, consumedCost, recoveryCost } = input

  // Assert identity match
  if (
    input.identity.sellerAccount !== recoveryCost.identity.sellerAccount ||
    input.identity.marketplace !== recoveryCost.identity.marketplace ||
    input.identity.orderId !== recoveryCost.identity.orderId ||
    input.identity.sku !== recoveryCost.identity.sku
  ) {
    throw new Error(
      `Financial recovery identity mismatch: input is order ${input.identity.orderId} SKU ${input.identity.sku}, but recoveryCost is order ${recoveryCost.identity.orderId} SKU ${recoveryCost.identity.sku}.`
    )
  }

  if (!Number.isFinite(financialNet)) {
    throw new RangeError(`calculateFinancialRecovery: financialNet must be a finite number. Received: ${financialNet}`)
  }

  if (consumedCost !== null && (!Number.isFinite(consumedCost) || consumedCost < 0)) {
    throw new RangeError(`calculateFinancialRecovery: consumedCost must be a non-negative finite number or null. Received: ${consumedCost}`)
  }

  const { totalRepairExpense, repairExpenseConfirmed, overallStatus } = recoveryCost

  // Enforce recovery ceiling: recovered cost cannot exceed consumed cost
  let confirmedRecoveredCost = recoveryCost.confirmedRecoveredCost
  if (consumedCost !== null && confirmedRecoveredCost > consumedCost) {
    statusReasons.push(`Confirmed recovered cost (₹${confirmedRecoveredCost}) exceeded consumed cost (₹${consumedCost}); clamped to consumed cost.`)
    confirmedRecoveredCost = consumedCost
  }

  let status: RecoveryFinancialStatus = 'CONFIRMED'
  let effectiveNetProfit: number | null = null
  let repairExpense: number | null = totalRepairExpense

  if (consumedCost === null) {
    status = 'MISSING_COST'
    statusReasons.push('Product cost is missing. Profit cannot be confirmed until unit cost is provided.')
  } else if (!repairExpenseConfirmed) {
    status = 'UNCONFIRMED_REPAIR'
    repairExpense = null
    statusReasons.push('Repairable units are present but repair expense has not been confirmed.')
  } else if (overallStatus === 'PROVISIONAL') {
    status = 'PROVISIONAL'
    statusReasons.push('Physical inspection is incomplete. Some units remain uninspected.')
  } else {
    status = 'CONFIRMED'
    statusReasons.push('Physical inspection and all recovery values are confirmed.')
  }

  // Formula calculation when required inputs are present
  if (consumedCost !== null && repairExpenseConfirmed) {
    effectiveNetProfit = round(financialNet - consumedCost + confirmedRecoveredCost - totalRepairExpense)
  }

  const adjustments: RecoveryAdjustments = {
    inventoryRecoveryAdjustment: confirmedRecoveredCost,
    repairExpenseAdjustment: totalRepairExpense > 0 ? -round(totalRepairExpense) : 0,
    netCostImpact: consumedCost !== null ? round(-(consumedCost - confirmedRecoveredCost + totalRepairExpense)) : null,
  }

  return {
    identity: input.identity,
    financialNet: round(financialNet),
    consumedCost: consumedCost !== null ? round(consumedCost) : null,
    confirmedRecoveredCost,
    repairExpense,
    effectiveNetProfit,
    status,
    adjustments,
    statusReasons,
  }
}

/**
 * Aggregate a list of individual financial recovery results into a portfolio summary.
 */
export function summarizeRecoveryPortfolio(
  results: readonly FinancialRecoveryResult[],
  returnedQuantitiesByItem?: ReadonlyMap<string, number>
): RecoveryPortfolioSummary {
  let confirmedItemsCount = 0
  let provisionalItemsCount = 0
  let missingCostItemsCount = 0
  let unconfirmedRepairItemsCount = 0

  let totalFinancialNet = 0
  let totalConfirmedRecoveredCost = 0
  let totalRepairExpense = 0
  let totalEffectiveNetProfit: number | null = 0
  let hasIncompleteProfits = false
  let totalReturnedUnits = 0

  for (const item of results) {
    totalFinancialNet += item.financialNet
    totalConfirmedRecoveredCost += item.confirmedRecoveredCost
    totalRepairExpense += item.repairExpense ?? 0

    if (item.effectiveNetProfit === null) {
      hasIncompleteProfits = true
    } else if (!hasIncompleteProfits && totalEffectiveNetProfit !== null) {
      totalEffectiveNetProfit += item.effectiveNetProfit
    }

    switch (item.status) {
      case 'CONFIRMED':
        confirmedItemsCount++
        break
      case 'PROVISIONAL':
        provisionalItemsCount++
        break
      case 'MISSING_COST':
        missingCostItemsCount++
        break
      case 'UNCONFIRMED_REPAIR':
        unconfirmedRepairItemsCount++
        break
    }
  }

  if (returnedQuantitiesByItem) {
    for (const qty of returnedQuantitiesByItem.values()) {
      totalReturnedUnits += qty
    }
  }

  return {
    totalReturnItems: results.length,
    totalReturnedUnits,
    confirmedItemsCount,
    provisionalItemsCount,
    missingCostItemsCount,
    unconfirmedRepairItemsCount,
    totalFinancialNet: round(totalFinancialNet),
    totalConfirmedRecoveredCost: round(totalConfirmedRecoveredCost),
    totalRepairExpense: round(totalRepairExpense),
    totalEffectiveNetProfit: hasIncompleteProfits ? null : (totalEffectiveNetProfit !== null ? round(totalEffectiveNetProfit) : null),
    isComplete: !hasIncompleteProfits && results.length > 0 && provisionalItemsCount === 0 && unconfirmedRepairItemsCount === 0,
  }
}
