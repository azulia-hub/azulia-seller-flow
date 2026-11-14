import { describe, it, expect } from 'vitest'
import { calculateFinancialRecovery, summarizeRecoveryPortfolio } from './financialRecovery'
import { matchesRecoveryFilter, filterRecoveryItems } from './recoveryFilter'
import type {
  ReturnItemIdentity,
  RecoveryCostResult,
  FinancialRecoveryInput,
  ReturnInspectionRecord,
} from './types'

const identity: ReturnItemIdentity = {
  sellerAccount: 'SELLER_1',
  marketplace: 'amazon.in',
  orderId: '402-1234567-8901234',
  sku: 'SHIRT-BLU-L',
}

describe('Financial Recovery Calculations', () => {
  it('computes effective net profit with confirmed sellable inventory restoration', () => {
    const recoveryCost: RecoveryCostResult = {
      identity,
      returnedQuantity: 1,
      inspectedQuantity: 1,
      uninspectedQuantity: 0,
      applicableCost: 200,
      confirmedRecoveredCost: 200,
      totalRepairExpense: 0,
      repairExpenseConfirmed: true,
      overallStatus: 'CONFIRMED',
      notes: [],
    }

    const input: FinancialRecoveryInput = {
      identity,
      // Marketplace recorded: sale 1000 - refund 1000 + fee rebate 150 - shipping 100 + reimbursement 0 = -50
      financialNet: -50,
      consumedCost: 200,
      recoveryCost,
    }

    const result = calculateFinancialRecovery(input)

    // Formula: financialNet (-50) - consumedCost (200) + confirmedRecoveredCost (200) - repairExpense (0) = -50
    expect(result.effectiveNetProfit).toBe(-50)
    expect(result.status).toBe('CONFIRMED')
    expect(result.adjustments.inventoryRecoveryAdjustment).toBe(200)
    expect(result.adjustments.repairExpenseAdjustment).toBe(0)
    expect(result.adjustments.netCostImpact).toBe(0)
  })

  it('deducts repair expense from net recovery for confirmed repairable item', () => {
    const recoveryCost: RecoveryCostResult = {
      identity,
      returnedQuantity: 1,
      inspectedQuantity: 1,
      uninspectedQuantity: 0,
      applicableCost: 200,
      confirmedRecoveredCost: 200,
      totalRepairExpense: 35,
      repairExpenseConfirmed: true,
      overallStatus: 'CONFIRMED',
      notes: [],
    }

    const input: FinancialRecoveryInput = {
      identity,
      financialNet: -50,
      consumedCost: 200,
      recoveryCost,
    }

    const result = calculateFinancialRecovery(input)

    // Formula: -50 - 200 + 200 - 35 = -85
    expect(result.effectiveNetProfit).toBe(-85)
    expect(result.status).toBe('CONFIRMED')
    expect(result.repairExpense).toBe(35)
    expect(result.adjustments.repairExpenseAdjustment).toBe(-35)
    expect(result.adjustments.netCostImpact).toBe(-35)
  })

  it('correctly handles ₹20 repair expense with ₹10 and ₹60 reimbursement without double counting', () => {
    // Scenario 1: ₹10 Amazon reimbursement already present in financialNet
    // Product refund: -100, Amazon fee rebate: +20, Shipping charge: -10, Reimbursement: +10 => financialNet = -80
    // Consumed cost = 100
    // Recovered: unit repaired to sellable (recovered value 100), repair expense 20
    const recoveryCost: RecoveryCostResult = {
      identity,
      returnedQuantity: 1,
      inspectedQuantity: 1,
      uninspectedQuantity: 0,
      applicableCost: 100,
      confirmedRecoveredCost: 100,
      totalRepairExpense: 20,
      repairExpenseConfirmed: true,
      overallStatus: 'CONFIRMED',
      notes: [],
    }

    const input10: FinancialRecoveryInput = {
      identity,
      financialNet: -80, // already contains +10 reimbursement
      consumedCost: 100,
      recoveryCost,
    }
    const result10 = calculateFinancialRecovery(input10)
    // effectiveNetProfit = financialNet (-80) - consumedCost (100) + confirmedRecoveredCost (100) - repairExpense (20) = -100
    expect(result10.effectiveNetProfit).toBe(-100)
    expect(result10.repairExpense).toBe(20)

    // Scenario 2: ₹60 reimbursement (e.g. SAFE-T claim approved for ₹60)
    // financialNet = -100 + 20 - 10 + 60 = -30
    const input60: FinancialRecoveryInput = {
      identity,
      financialNet: -30, // already contains +60 reimbursement
      consumedCost: 100,
      recoveryCost,
    }
    const result60 = calculateFinancialRecovery(input60)
    // effectiveNetProfit = -30 - 100 + 100 - 20 = -50
    expect(result60.effectiveNetProfit).toBe(-50)
    expect(result60.repairExpense).toBe(20)
  })

  it('rejects identity mismatch between financial input and recovery cost', () => {
    const recoveryCost: RecoveryCostResult = {
      identity: { ...identity, orderId: '402-DIFFERENT-ORDER' },
      returnedQuantity: 1,
      inspectedQuantity: 1,
      uninspectedQuantity: 0,
      applicableCost: 100,
      confirmedRecoveredCost: 100,
      totalRepairExpense: 0,
      repairExpenseConfirmed: true,
      overallStatus: 'CONFIRMED',
      notes: [],
    }

    expect(() => calculateFinancialRecovery({
      identity,
      financialNet: -50,
      consumedCost: 100,
      recoveryCost,
    })).toThrowError(/identity mismatch/i)
  })

  it('clamps confirmedRecoveredCost to consumedCost preventing phantom profits', () => {
    const recoveryCost: RecoveryCostResult = {
      identity,
      returnedQuantity: 1,
      inspectedQuantity: 1,
      uninspectedQuantity: 0,
      applicableCost: 100,
      confirmedRecoveredCost: 150, // exceeds consumed cost!
      totalRepairExpense: 0,
      repairExpenseConfirmed: true,
      overallStatus: 'CONFIRMED',
      notes: [],
    }

    const result = calculateFinancialRecovery({
      identity,
      financialNet: -50,
      consumedCost: 100,
      recoveryCost,
    })

    // confirmedRecoveredCost is clamped to consumedCost (100)
    // effectiveNetProfit = -50 - 100 + 100 - 0 = -50
    expect(result.effectiveNetProfit).toBe(-50)
    expect(result.statusReasons.some(r => r.includes('clamped'))).toBe(true)
  })

  it('marks status as MISSING_COST when consumed cost is null', () => {
    const recoveryCost: RecoveryCostResult = {
      identity,
      returnedQuantity: 1,
      inspectedQuantity: 1,
      uninspectedQuantity: 0,
      applicableCost: null,
      confirmedRecoveredCost: 0,
      totalRepairExpense: 0,
      repairExpenseConfirmed: true,
      overallStatus: 'CONFIRMED',
      notes: [],
    }

    const input: FinancialRecoveryInput = {
      identity,
      financialNet: -50,
      consumedCost: null, // missing cost!
      recoveryCost,
    }

    const result = calculateFinancialRecovery(input)

    expect(result.status).toBe('MISSING_COST')
    expect(result.effectiveNetProfit).toBeNull()
    expect(result.adjustments.netCostImpact).toBeNull()
    expect(result.statusReasons.some(r => r.includes('missing'))).toBe(true)
  })

  it('marks status as UNCONFIRMED_REPAIR when repair expense is pending', () => {
    const recoveryCost: RecoveryCostResult = {
      identity,
      returnedQuantity: 1,
      inspectedQuantity: 1,
      uninspectedQuantity: 0,
      applicableCost: 200,
      confirmedRecoveredCost: 200,
      totalRepairExpense: 0,
      repairExpenseConfirmed: false, // pending!
      overallStatus: 'PROVISIONAL',
      notes: [],
    }

    const input: FinancialRecoveryInput = {
      identity,
      financialNet: -50,
      consumedCost: 200,
      recoveryCost,
    }

    const result = calculateFinancialRecovery(input)

    expect(result.status).toBe('UNCONFIRMED_REPAIR')
    expect(result.effectiveNetProfit).toBeNull()
    expect(result.repairExpense).toBeNull()
    expect(result.statusReasons.some(r => r.includes('repair expense has not been confirmed'))).toBe(true)
  })

  it('retains original consumed cost in net profit when physical inspection is provisional', () => {
    const recoveryCost: RecoveryCostResult = {
      identity,
      returnedQuantity: 1,
      inspectedQuantity: 0,
      uninspectedQuantity: 1,
      applicableCost: 200,
      confirmedRecoveredCost: 0, // unconfirmed!
      totalRepairExpense: 0,
      repairExpenseConfirmed: true,
      overallStatus: 'PROVISIONAL',
      notes: [],
    }

    const input: FinancialRecoveryInput = {
      identity,
      financialNet: -50,
      consumedCost: 200,
      recoveryCost,
    }

    const result = calculateFinancialRecovery(input)

    // Formula: -50 - 200 + 0 - 0 = -250 (provisional loss includes full product cost)
    expect(result.effectiveNetProfit).toBe(-250)
    expect(result.status).toBe('PROVISIONAL')
    expect(result.adjustments.inventoryRecoveryAdjustment).toBe(0)
    expect(result.adjustments.netCostImpact).toBe(-200)
  })

  it('summarizes a portfolio of recovery results', () => {
    const recoveryCostConfirmed: RecoveryCostResult = {
      identity,
      returnedQuantity: 1,
      inspectedQuantity: 1,
      uninspectedQuantity: 0,
      applicableCost: 100,
      confirmedRecoveredCost: 100,
      totalRepairExpense: 0,
      repairExpenseConfirmed: true,
      overallStatus: 'CONFIRMED',
      notes: [],
    }

    const item1 = calculateFinancialRecovery({
      identity,
      financialNet: -20,
      consumedCost: 100,
      recoveryCost: recoveryCostConfirmed,
    })

    const recoveryCostProvisional: RecoveryCostResult = {
      identity: { ...identity, orderId: '402-9999999-9999999' },
      returnedQuantity: 1,
      inspectedQuantity: 0,
      uninspectedQuantity: 1,
      applicableCost: 150,
      confirmedRecoveredCost: 0,
      totalRepairExpense: 0,
      repairExpenseConfirmed: true,
      overallStatus: 'PROVISIONAL',
      notes: [],
    }

    const item2 = calculateFinancialRecovery({
      identity: { ...identity, orderId: '402-9999999-9999999' },
      financialNet: -30,
      consumedCost: 150,
      recoveryCost: recoveryCostProvisional,
    })

    const summary = summarizeRecoveryPortfolio([item1, item2])
    expect(summary.totalReturnItems).toBe(2)
    expect(summary.confirmedItemsCount).toBe(1)
    expect(summary.provisionalItemsCount).toBe(1)
    expect(summary.totalConfirmedRecoveredCost).toBe(100)
    expect(summary.totalFinancialNet).toBe(-50)
    expect(summary.isComplete).toBe(false)
  })
})

describe('Recovery Filters', () => {
  const sampleInspection: ReturnInspectionRecord = {
    identity,
    returnedQuantity: 2,
    dispositions: [
      {
        id: 'd1',
        state: 'REPAIRABLE',
        quantity: 1,
        recoveredValue: 100,
        repairExpense: 20,
        repairConfirmed: true,
        inspectedAt: '2026-11-14T10:00:00.000Z',
      },
      {
        id: 'd2',
        state: 'LOST',
        quantity: 1,
        recoveredValue: 0,
        repairExpense: null,
        repairConfirmed: false,
        reimbursementClaimRecommended: true,
        reimbursementClaimReason: 'Courier lost package in transit',
        inspectedAt: '2026-11-14T10:00:00.000Z',
      },
    ],
    overallStatus: 'CONFIRMED',
    updatedAt: '2026-11-14T10:00:00.000Z',
    version: 1,
  }

  const item = {
    orderId: '402-1234567-8901234',
    sku: 'SHIRT-BLU-L',
    asin: 'B01EXAMPLE1',
    productTitle: 'Blue Cotton Shirt Large',
    inspection: sampleInspection,
  }

  it('matches text search across orderId, sku, asin, and productTitle', () => {
    expect(matchesRecoveryFilter(item, { search: '1234567' })).toBe(true)
    expect(matchesRecoveryFilter(item, { search: 'SHIRT' })).toBe(true)
    expect(matchesRecoveryFilter(item, { search: 'B01EXAMPLE1' })).toBe(true)
    expect(matchesRecoveryFilter(item, { search: 'Cotton' })).toBe(true)
    expect(matchesRecoveryFilter(item, { search: 'NonExistent' })).toBe(false)
  })

  it('matches operational status filters', () => {
    expect(matchesRecoveryFilter(item, { status: 'REPAIRABLE' })).toBe(true)
    expect(matchesRecoveryFilter(item, { status: 'DAMAGED_LOST' })).toBe(true)
    expect(matchesRecoveryFilter(item, { status: 'REIMBURSEMENT_REVIEW' })).toBe(true)
  })

  it('filters a list of items using filterRecoveryItems', () => {
    const list = [item, { ...item, orderId: '403-0000000-0000000', inspection: null }]
    const unconfirmed = filterRecoveryItems(list, { status: 'UNCONFIRMED' })
    expect(unconfirmed).toHaveLength(1)
    expect(unconfirmed[0].orderId).toBe('403-0000000-0000000')
  })
})
