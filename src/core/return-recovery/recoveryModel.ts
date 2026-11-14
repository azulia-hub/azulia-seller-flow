import type {
  ReturnItemIdentity,
  ReturnItemDisposition,
  ReturnInspectionRecord,
  RecoveryCalculationInput,
  RecoveryCostResult,
  OverallRecoveryStatus,
} from './types'

/** Deterministic precision rounding to 2 decimal places. */
export function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * Generate a collision-safe deterministic composite key for identifying a return item.
 * Uses URI encoding on all parts to prevent collisions with colons inside SKU or seller names.
 */
export function stableRecoveryKey(identity: ReturnItemIdentity): string {
  const parts = [
    encodeURIComponent(identity.sellerAccount),
    encodeURIComponent(identity.marketplace),
    encodeURIComponent(identity.orderId),
    encodeURIComponent(identity.sku),
  ]
  if (identity.orderItemId) {
    parts.push(encodeURIComponent(identity.orderItemId))
  }
  return parts.join(':')
}

/**
 * Parse a composite recovery key back into its identity fields.
 * Supports collision-safe URI-encoded keys as well as legacy unencoded keys.
 */
export function parseRecoveryKey(key: string): ReturnItemIdentity | null {
  if (!key || typeof key !== 'string') return null

  // Support JSON-encoded format if present
  if (key.startsWith('{') && key.endsWith('}')) {
    try {
      const obj = JSON.parse(key)
      if (obj.sellerAccount && obj.marketplace && obj.orderId && obj.sku) {
        return {
          sellerAccount: String(obj.sellerAccount),
          marketplace: String(obj.marketplace),
          orderId: String(obj.orderId),
          sku: String(obj.sku),
          orderItemId: obj.orderItemId ? String(obj.orderItemId) : null,
        }
      }
    } catch {
      // Fall through to delimiter parsing
    }
  }

  const parts = key.split(':')
  if (parts.length < 4) return null

  try {
    const sellerAccount = decodeURIComponent(parts[0])
    const marketplace = decodeURIComponent(parts[1])
    const orderId = decodeURIComponent(parts[2])
    // If legacy key had unencoded colons in SKU and exactly 4 parts:
    if (parts.length === 4) {
      return {
        sellerAccount,
        marketplace,
        orderId,
        sku: decodeURIComponent(parts[3]),
        orderItemId: null,
      }
    }

    if (parts.length === 5) {
      return {
        sellerAccount,
        marketplace,
        orderId,
        sku: decodeURIComponent(parts[3]),
        orderItemId: decodeURIComponent(parts[4]) || null,
      }
    }

    // If key was an unencoded legacy key with colons in SKU:
    const sku = parts.slice(3).join(':')
    return {
      sellerAccount,
      marketplace,
      orderId,
      sku,
      orderItemId: null,
    }
  } catch {
    return null
  }
}

/**
 * Create a default, unconfirmed inspection record awaiting physical examination.
 * Defaults strictly to unconfirmed AWAITING_INSPECTION.
 */
export function createDefaultInspection(
  identity: ReturnItemIdentity,
  returnedQuantity: number,
  nowIso = new Date().toISOString()
): ReturnInspectionRecord {
  if (!Number.isSafeInteger(returnedQuantity) || returnedQuantity <= 0) {
    throw new RangeError(`Returned quantity must be a positive safe integer. Received: ${returnedQuantity}`)
  }

  const initialDisposition: ReturnItemDisposition = {
    id: 'disp_default',
    state: 'AWAITING_INSPECTION',
    quantity: returnedQuantity,
    recoveredValue: null,
    repairExpense: null,
    repairConfirmed: false,
    notes: null,
    inspectedAt: null,
    inspectedBy: null,
    reimbursementClaimRecommended: false,
    reimbursementClaimReason: null,
  }

  return {
    identity,
    returnedQuantity,
    dispositions: [initialDisposition],
    overallStatus: 'PROVISIONAL',
    updatedAt: nowIso,
    version: 1,
  }
}

/**
 * Validate inspection dispositions for quantity safety, positive integers, and money bounds.
 */
export function validateDispositions(
  returnedQuantity: number,
  dispositions: readonly ReturnItemDisposition[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!Number.isSafeInteger(returnedQuantity) || returnedQuantity <= 0) {
    errors.push('Returned quantity must be a positive whole integer.')
  }

  let totalAllocated = 0

  for (let index = 0; index < dispositions.length; index++) {
    const d = dispositions[index]
    const label = `Disposition #${index + 1} (${d.state})`

    if (!Number.isSafeInteger(d.quantity) || d.quantity <= 0) {
      errors.push(`${label}: quantity must be a positive whole integer.`)
    } else {
      totalAllocated += d.quantity
    }

    if (d.recoveredValue !== null && (d.recoveredValue < 0 || !Number.isFinite(d.recoveredValue))) {
      errors.push(`${label}: recovered value cannot be negative or invalid.`)
    }

    if (d.repairExpense !== null && (d.repairExpense < 0 || !Number.isFinite(d.repairExpense))) {
      errors.push(`${label}: repair expense cannot be negative or invalid.`)
    }

    if (d.state === 'REPAIRABLE' && d.repairConfirmed && d.repairExpense === null) {
      errors.push(`${label}: repair is confirmed but repair expense amount is missing.`)
    }
  }

  if (totalAllocated > returnedQuantity) {
    errors.push(`Total disposition quantity (${totalAllocated}) exceeds returned quantity (${returnedQuantity}).`)
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Assert identity matching between request and inspection.
 */
function assertMatchingIdentity(a: ReturnItemIdentity, b: ReturnItemIdentity): void {
  if (
    a.sellerAccount !== b.sellerAccount ||
    a.marketplace !== b.marketplace ||
    a.orderId !== b.orderId ||
    a.sku !== b.sku
  ) {
    throw new Error(
      `Inspection identity mismatch: expected order ${a.orderId} SKU ${a.sku} (${a.sellerAccount}), received order ${b.orderId} SKU ${b.sku} (${b.sellerAccount}).`
    )
  }
}

/**
 * Calculate deterministic inventory cost recovery and repair obligations.
 *
 * Invariants:
 * 1. Strict input validation: returnedQuantity and disposition quantities must be safe positive integers.
 * 2. Identity isolation: inspection identity must strictly match calculation identity.
 * 3. Provisional results retain original consumed product cost until recovery is confirmed.
 * 4. Sellable recovery restores applicable cost (unitCost * quantity).
 * 5. Partial/damaged recovery uses explicit confirmed value.
 * 6. Never recover more quantity or monetary value than original applicable cost.
 * 7. Repair expenses are preserved and counted independently of subsequent condition transitions.
 * 8. Unknowns are preserved explicitly (null, never assumed zero).
 */
export function calculateRecoveryCost(input: RecoveryCalculationInput): RecoveryCostResult {
  if (!Number.isSafeInteger(input.returnedQuantity) || input.returnedQuantity <= 0) {
    throw new RangeError(
      `calculateRecoveryCost: returnedQuantity must be a positive safe integer. Received: ${input.returnedQuantity}`
    )
  }
  const returnedQuantity = input.returnedQuantity

  if (input.unitCost !== null && (!Number.isFinite(input.unitCost) || input.unitCost < 0)) {
    throw new RangeError(`calculateRecoveryCost: unitCost must be a non-negative finite number or null. Received: ${input.unitCost}`)
  }
  const applicableCost = input.unitCost !== null ? round(input.unitCost * returnedQuantity) : null

  // Validate identity isolation if inspection is provided
  if (input.inspection) {
    assertMatchingIdentity(input.identity, input.inspection.identity)
  }

  const notes: string[] = []
  const dispositions = input.inspection?.dispositions ?? []

  if (!dispositions.length) {
    notes.push('Awaiting physical inspection. Consumed product cost remains in effect.')
    return {
      identity: input.identity,
      returnedQuantity,
      inspectedQuantity: 0,
      uninspectedQuantity: returnedQuantity,
      applicableCost,
      confirmedRecoveredCost: 0,
      totalRepairExpense: 0,
      repairExpenseConfirmed: true,
      overallStatus: 'PROVISIONAL',
      notes,
    }
  }

  // Validate all dispositions strictly
  const validation = validateDispositions(returnedQuantity, dispositions)
  if (!validation.valid) {
    throw new Error(`calculateRecoveryCost validation failed: ${validation.errors.join('; ')}`)
  }

  let inspectedQuantity = 0
  let uninspectedQuantity = 0
  let confirmedRecoveredCost = 0
  let totalRepairExpense = 0
  let repairExpenseConfirmed = true

  for (const disp of dispositions) {
    const qty = disp.quantity
    const itemApplicableCost = input.unitCost !== null ? round(input.unitCost * qty) : null

    // Rule: Always preserve and count confirmed repair expenses once, regardless of condition state
    if (disp.repairConfirmed && disp.repairExpense !== null && disp.repairExpense > 0) {
      totalRepairExpense += disp.repairExpense
    }

    switch (disp.state) {
      case 'AWAITING_INSPECTION': {
        uninspectedQuantity += qty
        notes.push(`${qty} unit(s) awaiting physical inspection.`)
        break
      }

      case 'SELLABLE': {
        inspectedQuantity += qty
        let recovered = disp.recoveredValue !== null
          ? disp.recoveredValue
          : itemApplicableCost !== null
          ? itemApplicableCost
          : 0

        // Invariant: Never recover more value than original applicable cost
        if (itemApplicableCost !== null && recovered > itemApplicableCost) {
          notes.push(`Sellable recovered value for SKU ${input.identity.sku} clamped to applicable unit cost (₹${itemApplicableCost}).`)
          recovered = itemApplicableCost
        }

        confirmedRecoveredCost += recovered
        break
      }

      case 'REPAIRABLE': {
        inspectedQuantity += qty
        let recovered = disp.recoveredValue !== null
          ? disp.recoveredValue
          : itemApplicableCost !== null
          ? itemApplicableCost
          : 0

        if (itemApplicableCost !== null && recovered > itemApplicableCost) {
          notes.push(`Repairable recovered value for SKU ${input.identity.sku} clamped to applicable cost (₹${itemApplicableCost}).`)
          recovered = itemApplicableCost
        }

        confirmedRecoveredCost += recovered

        if (!disp.repairConfirmed) {
          repairExpenseConfirmed = false
          notes.push(`${qty} unit(s) marked repairable with pending repair expense.`)
        }
        break
      }

      case 'DAMAGED':
      case 'WRONG_OR_MISSING':
      case 'LOST': {
        inspectedQuantity += qty
        if (disp.recoveredValue !== null && disp.recoveredValue > 0) {
          let salvage = disp.recoveredValue
          if (itemApplicableCost !== null && salvage > itemApplicableCost) {
            salvage = itemApplicableCost
            notes.push(`Salvage value for ${disp.state} SKU ${input.identity.sku} clamped to applicable cost.`)
          }
          confirmedRecoveredCost += salvage
        }
        break
      }
    }
  }

  // Any unallocated returned quantity remains uninspected
  const totalAllocated = inspectedQuantity + uninspectedQuantity
  if (totalAllocated < returnedQuantity) {
    const unallocated = returnedQuantity - totalAllocated
    uninspectedQuantity += unallocated
    notes.push(`${unallocated} unassigned unit(s) treated as awaiting inspection.`)
  }

  // Final invariant: Total recovered cost cannot exceed total applicable cost
  if (applicableCost !== null && confirmedRecoveredCost > applicableCost) {
    confirmedRecoveredCost = applicableCost
  }

  confirmedRecoveredCost = round(confirmedRecoveredCost)
  totalRepairExpense = round(totalRepairExpense)

  const overallStatus: OverallRecoveryStatus =
    uninspectedQuantity === 0 &&
    inspectedQuantity === returnedQuantity &&
    repairExpenseConfirmed
      ? 'CONFIRMED'
      : 'PROVISIONAL'

  return {
    identity: input.identity,
    returnedQuantity,
    inspectedQuantity,
    uninspectedQuantity,
    applicableCost,
    confirmedRecoveredCost,
    totalRepairExpense,
    repairExpenseConfirmed,
    overallStatus,
    notes,
  }
}
