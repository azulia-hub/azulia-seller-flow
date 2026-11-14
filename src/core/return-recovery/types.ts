/**
 * Return Recovery Domain Types
 *
 * Deterministic types for tracking physical returns, inspection dispositions,
 * inventory cost restorations, and net recovery financial outcomes.
 *
 * Core rule: Pure TypeScript only. No React, ECharts, Dexie, or marketplace APIs.
 */

/**
 * Condition / physical disposition state of an inspected return item.
 */
export type ReturnItemConditionState =
  | 'AWAITING_INSPECTION'
  | 'SELLABLE'
  | 'REPAIRABLE'
  | 'DAMAGED'
  | 'WRONG_OR_MISSING'
  | 'LOST'

/**
 * Overall inspection and recovery confirmation status.
 * - PROVISIONAL: Some or all returned units await inspection, or repair expense is unconfirmed.
 * - CONFIRMED: All returned units have been inspected with all values confirmed.
 */
export type OverallRecoveryStatus = 'PROVISIONAL' | 'CONFIRMED'

/**
 * Financial recovery status reflecting complete or missing information.
 */
export type RecoveryFinancialStatus =
  | 'CONFIRMED'
  | 'PROVISIONAL'
  | 'MISSING_COST'
  | 'UNCONFIRMED_REPAIR'

/**
 * Unique multi-tenant identity of a return item.
 */
export interface ReturnItemIdentity {
  readonly sellerAccount: string
  readonly marketplace: string
  readonly orderId: string
  readonly sku: string
  readonly orderItemId?: string | null
}

/**
 * Individual disposition breakdown within an inspection (supports partial quantities).
 * E.g., for an order item with 2 returned units:
 * - 1 unit SELLABLE
 * - 1 unit DAMAGED
 */
export interface ReturnItemDisposition {
  readonly id: string
  readonly state: ReturnItemConditionState
  readonly quantity: number
  /**
   * Confirmed recovered inventory asset value.
   * - null: unconfirmed or unknown
   * - 0: complete loss (e.g. discarded scrap, stolen)
   * - positive number: confirmed inventory value restored
   */
  readonly recoveredValue: number | null
  /**
   * Repair or reconditioning expense incurred.
   * - null: unconfirmed
   * - 0: explicit confirmation that no repair expense was incurred
   * - positive number: repair cost
   */
  readonly repairExpense: number | null
  /**
   * Must be explicitly true to confirm repair expense (even when expense is 0).
   * Prevents silently treating unknown repair expenses as zero.
   */
  readonly repairConfirmed: boolean
  readonly notes?: string | null
  readonly inspectedAt: string | null
  readonly inspectedBy?: string | null
  /**
   * Flag indicating whether an Amazon SAFE-T, courier damage, or weight-discrepancy
   * reimbursement claim is recommended.
   */
  readonly reimbursementClaimRecommended?: boolean
  readonly reimbursementClaimReason?: string | null
}

/**
 * User-entered inspection record for a return item.
 * Kept strictly isolated from Amazon source sync data.
 */
export interface ReturnInspectionRecord {
  readonly identity: ReturnItemIdentity
  readonly returnedQuantity: number
  readonly dispositions: readonly ReturnItemDisposition[]
  readonly overallStatus: OverallRecoveryStatus
  readonly updatedAt: string
  readonly version: number
}

/**
 * Input for pure recovery cost calculations.
 */
export interface RecoveryCalculationInput {
  readonly identity: ReturnItemIdentity
  readonly returnedQuantity: number
  /** Unit product cost at time of purchase. null if cost is missing. */
  readonly unitCost: number | null
  readonly inspection?: ReturnInspectionRecord | null
}

/**
 * Output of recovery cost evaluation.
 */
export interface RecoveryCostResult {
  readonly identity: ReturnItemIdentity
  readonly returnedQuantity: number
  readonly inspectedQuantity: number
  readonly uninspectedQuantity: number
  /** Original product cost consumed by the returned units: unitCost * returnedQuantity */
  readonly applicableCost: number | null
  /** Total confirmed inventory value recovered to sellable or refurbished stock */
  readonly confirmedRecoveredCost: number
  /** Total confirmed repair / reconditioning expense incurred */
  readonly totalRepairExpense: number
  /** Whether all repairable dispositions have explicit confirmed repair expenses */
  readonly repairExpenseConfirmed: boolean
  readonly overallStatus: OverallRecoveryStatus
  readonly notes: readonly string[]
}

/**
 * Financial input to compute net recovery.
 *
 * IMPORTANT FINANCIAL INVARIANT:
 * financialNet ALREADY includes Amazon sales, customer refunds, marketplace fees,
 * shipping charges/reversals, and Amazon reimbursements.
 * Do NOT add reimbursements again.
 */
export interface FinancialRecoveryInput {
  readonly identity: ReturnItemIdentity
  /** Net monetary amount recorded by the marketplace for this order/item. */
  readonly financialNet: number
  /** Consumed product cost for this return item (unitCost * returnedQuantity). null if cost missing. */
  readonly consumedCost: number | null
  readonly recoveryCost: RecoveryCostResult
}

/**
 * Adjustments to be applied to net business profit.
 */
export interface RecoveryAdjustments {
  /** Value of inventory restored to asset stock (+amount). */
  readonly inventoryRecoveryAdjustment: number
  /** Repair or reconditioning operating expense incurred (-amount). */
  readonly repairExpenseAdjustment: number
  /** Net cost impact = -(consumedCost - confirmedRecoveredCost + repairExpense). */
  readonly netCostImpact: number | null
}

/**
 * Comprehensive recovery financial outcome.
 */
export interface FinancialRecoveryResult {
  readonly identity: ReturnItemIdentity
  readonly financialNet: number
  readonly consumedCost: number | null
  readonly confirmedRecoveredCost: number
  readonly repairExpense: number | null
  /**
   * Final effective net profit after return recovery:
   * financialNet - consumedCost + confirmedRecoveredCost - repairExpense
   */
  readonly effectiveNetProfit: number | null
  readonly status: RecoveryFinancialStatus
  readonly adjustments: RecoveryAdjustments
  readonly statusReasons: readonly string[]
}

/**
 * Specification for querying and filtering return recovery records.
 */
export interface ReturnRecoveryFilterSpec {
  readonly search?: string
  readonly status?: 'ALL' | 'UNCONFIRMED' | 'REPAIRABLE' | 'DAMAGED_LOST' | 'REIMBURSEMENT_REVIEW'
  readonly state?: ReturnItemConditionState | 'ALL'
}
