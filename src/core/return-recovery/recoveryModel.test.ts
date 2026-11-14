import { describe, it, expect } from 'vitest'
import {
  calculateRecoveryCost,
  createDefaultInspection,
  validateDispositions,
  stableRecoveryKey,
  parseRecoveryKey,
} from './recoveryModel'
import type { ReturnItemIdentity, ReturnInspectionRecord, ReturnItemDisposition } from './types'

const identity: ReturnItemIdentity = {
  sellerAccount: 'SELLER_1',
  marketplace: 'amazon.in',
  orderId: '402-1234567-8901234',
  sku: 'SHIRT-BLU-L',
}

describe('Return Recovery Model', () => {
  it('creates default inspection awaiting examination with provisional status', () => {
    const inspection = createDefaultInspection(identity, 2, '2026-11-14T10:00:00.000Z')
    expect(inspection.returnedQuantity).toBe(2)
    expect(inspection.overallStatus).toBe('PROVISIONAL')
    expect(inspection.dispositions).toHaveLength(1)
    expect(inspection.dispositions[0].state).toBe('AWAITING_INSPECTION')
    expect(inspection.dispositions[0].quantity).toBe(2)
    expect(inspection.dispositions[0].recoveredValue).toBeNull()
    expect(inspection.dispositions[0].repairConfirmed).toBe(false)
  })

  it('generates and parses stable recovery composite keys including colons in SKUs', () => {
    const key = stableRecoveryKey(identity)
    expect(key).toBe('SELLER_1:amazon.in:402-1234567-8901234:SHIRT-BLU-L')
    const parsed = parseRecoveryKey(key)
    expect(parsed).toEqual({
      sellerAccount: 'SELLER_1',
      marketplace: 'amazon.in',
      orderId: '402-1234567-8901234',
      sku: 'SHIRT-BLU-L',
      orderItemId: null,
    })

    // Colon in SKU test
    const colonIdentity: ReturnItemIdentity = {
      sellerAccount: 'SELLER:A',
      marketplace: 'amazon.in',
      orderId: '402-1234567-8901234',
      sku: 'Trolly:22x9:PO2',
      orderItemId: 'ITEM:1',
    }
    const colonKey = stableRecoveryKey(colonIdentity)
    expect(colonKey).toBe('SELLER%3AA:amazon.in:402-1234567-8901234:Trolly%3A22x9%3APO2:ITEM%3A1')
    const parsedColon = parseRecoveryKey(colonKey)
    expect(parsedColon).toEqual(colonIdentity)
  })

  it('validates disposition quantities and bounds against returned total', () => {
    const validDispositions: ReturnItemDisposition[] = [
      {
        id: 'd1',
        state: 'SELLABLE',
        quantity: 1,
        recoveredValue: 200,
        repairExpense: null,
        repairConfirmed: false,
        inspectedAt: '2026-11-14T10:00:00.000Z',
      },
      {
        id: 'd2',
        state: 'DAMAGED',
        quantity: 1,
        recoveredValue: 0,
        repairExpense: null,
        repairConfirmed: false,
        inspectedAt: '2026-11-14T10:00:00.000Z',
      },
    ]

    const result = validateDispositions(2, validDispositions)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)

    const invalidDispositions: ReturnItemDisposition[] = [
      {
        id: 'd1',
        state: 'SELLABLE',
        quantity: 2,
        recoveredValue: 200,
        repairExpense: null,
        repairConfirmed: false,
        inspectedAt: '2026-11-14T10:00:00.000Z',
      },
      {
        id: 'd2',
        state: 'SELLABLE',
        quantity: 1,
        recoveredValue: 100,
        repairExpense: null,
        repairConfirmed: false,
        inspectedAt: '2026-11-14T10:00:00.000Z',
      },
    ]

    const overflowResult = validateDispositions(2, invalidDispositions)
    expect(overflowResult.valid).toBe(false)
    expect(overflowResult.errors[0]).toContain('exceeds returned quantity')

    // Fractional / negative / non-integer quantities
    const nonInteger = validateDispositions(2, [{
      id: 'd1',
      state: 'SELLABLE',
      quantity: 1.5,
      recoveredValue: null,
      repairExpense: null,
      repairConfirmed: false,
      inspectedAt: null,
    }])
    expect(nonInteger.valid).toBe(false)
    expect(nonInteger.errors[0]).toContain('must be a positive whole integer')

    const negativeExpense = validateDispositions(2, [{
      id: 'd1',
      state: 'SELLABLE',
      quantity: 1,
      recoveredValue: -50,
      repairExpense: -20,
      repairConfirmed: true,
      inspectedAt: null,
    }])
    expect(negativeExpense.valid).toBe(false)
    expect(negativeExpense.errors.length).toBeGreaterThan(0)
  })

  it('rejects identity mismatches between inspection and calculation input', () => {
    const inspection: ReturnInspectionRecord = {
      identity: { ...identity, sku: 'OTHER-SKU' },
      returnedQuantity: 1,
      dispositions: [{
        id: 'd1',
        state: 'SELLABLE',
        quantity: 1,
        recoveredValue: 100,
        repairExpense: null,
        repairConfirmed: false,
        inspectedAt: '2026-11-14T10:00:00.000Z',
      }],
      overallStatus: 'CONFIRMED',
      updatedAt: '2026-11-14T10:00:00.000Z',
      version: 1,
    }

    expect(() => calculateRecoveryCost({
      identity,
      returnedQuantity: 1,
      unitCost: 100,
      inspection,
    })).toThrowError(/identity mismatch/i)
  })

  it('preserves repair expense when unit is repaired to SELLABLE', () => {
    const inspection: ReturnInspectionRecord = {
      identity,
      returnedQuantity: 1,
      dispositions: [{
        id: 'd1',
        state: 'SELLABLE',
        quantity: 1,
        recoveredValue: 200,
        repairExpense: 20,
        repairConfirmed: true,
        inspectedAt: '2026-11-14T10:00:00.000Z',
      }],
      overallStatus: 'CONFIRMED',
      updatedAt: '2026-11-14T10:00:00.000Z',
      version: 1,
    }

    const costResult = calculateRecoveryCost({
      identity,
      returnedQuantity: 1,
      unitCost: 200,
      inspection,
    })

    expect(costResult.applicableCost).toBe(200)
    expect(costResult.confirmedRecoveredCost).toBe(200)
    expect(costResult.totalRepairExpense).toBe(20)
    expect(costResult.repairExpenseConfirmed).toBe(true)
    expect(costResult.overallStatus).toBe('CONFIRMED')
  })

  it('restores applicable cost for confirmed sellable units', () => {
    const inspection: ReturnInspectionRecord = {
      identity,
      returnedQuantity: 1,
      dispositions: [
        {
          id: 'd1',
          state: 'SELLABLE',
          quantity: 1,
          recoveredValue: null, // automatic default to unit cost
          repairExpense: null,
          repairConfirmed: false,
          inspectedAt: '2026-11-14T10:00:00.000Z',
        },
      ],
      overallStatus: 'CONFIRMED',
      updatedAt: '2026-11-14T10:00:00.000Z',
      version: 1,
    }

    const costResult = calculateRecoveryCost({
      identity,
      returnedQuantity: 1,
      unitCost: 250,
      inspection,
    })

    expect(costResult.applicableCost).toBe(250)
    expect(costResult.confirmedRecoveredCost).toBe(250)
    expect(costResult.uninspectedQuantity).toBe(0)
    expect(costResult.inspectedQuantity).toBe(1)
    expect(costResult.overallStatus).toBe('CONFIRMED')
  })

  it('clamps recovered value to applicable cost if user enters a higher amount', () => {
    const inspection: ReturnInspectionRecord = {
      identity,
      returnedQuantity: 1,
      dispositions: [
        {
          id: 'd1',
          state: 'SELLABLE',
          quantity: 1,
          recoveredValue: 500, // User entered 500, but cost was 250
          repairExpense: null,
          repairConfirmed: false,
          inspectedAt: '2026-11-14T10:00:00.000Z',
        },
      ],
      overallStatus: 'CONFIRMED',
      updatedAt: '2026-11-14T10:00:00.000Z',
      version: 1,
    }

    const costResult = calculateRecoveryCost({
      identity,
      returnedQuantity: 1,
      unitCost: 250,
      inspection,
    })

    expect(costResult.applicableCost).toBe(250)
    expect(costResult.confirmedRecoveredCost).toBe(250) // clamped!
    expect(costResult.notes.some(n => n.includes('clamped'))).toBe(true)
  })

  it('supports partial quantities with 1 sellable and 1 damaged with salvage value', () => {
    const inspection: ReturnInspectionRecord = {
      identity,
      returnedQuantity: 2,
      dispositions: [
        {
          id: 'd1',
          state: 'SELLABLE',
          quantity: 1,
          recoveredValue: null, // unit cost = 300
          repairExpense: null,
          repairConfirmed: false,
          inspectedAt: '2026-11-14T10:00:00.000Z',
        },
        {
          id: 'd2',
          state: 'DAMAGED',
          quantity: 1,
          recoveredValue: 50, // sold for 50 salvage
          repairExpense: null,
          repairConfirmed: false,
          inspectedAt: '2026-11-14T10:00:00.000Z',
        },
      ],
      overallStatus: 'CONFIRMED',
      updatedAt: '2026-11-14T10:00:00.000Z',
      version: 1,
    }

    const costResult = calculateRecoveryCost({
      identity,
      returnedQuantity: 2,
      unitCost: 300,
      inspection,
    })

    expect(costResult.applicableCost).toBe(600)
    expect(costResult.confirmedRecoveredCost).toBe(350) // 300 + 50
    expect(costResult.inspectedQuantity).toBe(2)
    expect(costResult.uninspectedQuantity).toBe(0)
    expect(costResult.overallStatus).toBe('CONFIRMED')
  })

  it('marks overall status PROVISIONAL when repairable item has unconfirmed repair expense', () => {
    const inspection: ReturnInspectionRecord = {
      identity,
      returnedQuantity: 1,
      dispositions: [
        {
          id: 'd1',
          state: 'REPAIRABLE',
          quantity: 1,
          recoveredValue: 200,
          repairExpense: null,
          repairConfirmed: false, // unconfirmed!
          inspectedAt: '2026-11-14T10:00:00.000Z',
        },
      ],
      overallStatus: 'PROVISIONAL',
      updatedAt: '2026-11-14T10:00:00.000Z',
      version: 1,
    }

    const costResult = calculateRecoveryCost({
      identity,
      returnedQuantity: 1,
      unitCost: 200,
      inspection,
    })

    expect(costResult.repairExpenseConfirmed).toBe(false)
    expect(costResult.overallStatus).toBe('PROVISIONAL')
  })

  it('marks overall status CONFIRMED when repairable item has explicit zero repair expense confirmed', () => {
    const inspection: ReturnInspectionRecord = {
      identity,
      returnedQuantity: 1,
      dispositions: [
        {
          id: 'd1',
          state: 'REPAIRABLE',
          quantity: 1,
          recoveredValue: 200,
          repairExpense: 0,
          repairConfirmed: true, // explicit zero repair confirmed
          inspectedAt: '2026-11-14T10:00:00.000Z',
        },
      ],
      overallStatus: 'CONFIRMED',
      updatedAt: '2026-11-14T10:00:00.000Z',
      version: 1,
    }

    const costResult = calculateRecoveryCost({
      identity,
      returnedQuantity: 1,
      unitCost: 200,
      inspection,
    })

    expect(costResult.repairExpenseConfirmed).toBe(true)
    expect(costResult.totalRepairExpense).toBe(0)
    expect(costResult.overallStatus).toBe('CONFIRMED')
  })
})
