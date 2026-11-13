import { describe, expect, it } from 'vitest'
import {
  calculateQualifyingInbound,
  calculateUsableStock,
  computeReplenishment,
} from './replenishment'
import type { CanonicalInventoryItem, DemandMetrics } from './types'

describe('Inventory replenishment engine', () => {
  const baseItem: CanonicalInventoryItem = {
    id: 'seller-1:amazon:SKU-100:FBA',
    sellerAccount: 'seller-1',
    marketplace: 'amazon',
    sku: 'SKU-100',
    fulfillmentChannel: 'FBA',
    quantities: {
      available: 50,
      reserved: 10,
      inbound: 20,
      inboundBreakdown: {
        working: 5,
        shipped: 15,
        receiving: 0,
        total: 20,
      },
      unsellable: 2,
      listed: null,
      manualPhysical: null,
    },
    provenance: {
      source: 'amazon-fba-inventory',
      observedAt: '2026-11-13T10:00:00Z',
    },
    updatedAt: '2026-11-13T10:00:00Z',
  }

  const baseDemand: DemandMetrics = {
    windowDays: 30,
    observedDays: 30,
    coverageRatio: 1,
    totalShippedUnits: 150,
    dailyDemand: 5, // 5 units per day
    stockoutDaysCount: 0,
    hasStockoutBias: false,
    confidence: 'HIGH_CONFIDENCE',
    notes: [],
  }

  it('calculates reorder point, target stock, and suggested quantity deterministically', () => {
    // leadTime = 14 days, safetyStock = 7 days, coverage = 30 days
    // reorderPoint = 5 * (14 + 7) = 105 units
    // targetStock = 5 * (14 + 7 + 30) = 255 units
    // usableStock = 50 (available)
    // qualifyingInbound = 15 (shipped only; working excluded by default)
    // deficit = 255 - 50 - 15 = 190 units
    const rec = computeReplenishment(baseItem, baseDemand, {
      leadTimeDays: 14,
      safetyStockDays: 7,
      replenishmentCoverageDays: 30,
      inboundArrivalConfirmed: true,
      includeInboundShipped: true,
      includeInboundReceiving: false,
    })

    expect(rec.dailyDemand).toBe(5)
    expect(rec.usableStock).toBe(50)
    expect(rec.qualifyingInbound).toBe(15)
    expect(rec.stockCoverDays).toBe(10) // 50 / 5 = 10 days
    expect(rec.reorderPoint).toBe(105)
    expect(rec.targetStock).toBe(255)
    expect(rec.rawSuggestedQuantity).toBe(190)
    expect(rec.suggestedQuantity).toBe(190)
    expect(rec.urgency).toBe('CRITICAL_REORDER') // 50 units cover 10 days, less than 14-day lead time
  })

  it('does NOT subtract reserved stock twice', () => {
    // In FBA, available (50) is already unreserved.
    // Usable stock should be 50, NOT 50 - 10 = 40.
    const usable = calculateUsableStock(baseItem, {
      leadTimeDays: 14,
      safetyStockDays: 7,
      replenishmentCoverageDays: 30,
      inboundArrivalConfirmed: true,
      includeInboundShipped: true,
      includeInboundReceiving: false,
    })
    expect(usable).toBe(50)
  })

  it('applies MOQ and pack multiple rounding ONLY for positive suggestions', () => {
    // Deficit is 190.
    // If MOQ is 250, suggestion increases to 250.
    // If packMultiple is 24, 250 rounded up to next multiple of 24 is 264.
    const rec = computeReplenishment(baseItem, baseDemand, {
      leadTimeDays: 14,
      safetyStockDays: 7,
      replenishmentCoverageDays: 30,
      inboundArrivalConfirmed: true,
      includeInboundShipped: true,
      includeInboundReceiving: false,
      minOrderQuantity: 250,
      packMultiple: 24,
    })

    expect(rec.rawSuggestedQuantity).toBe(190)
    expect(rec.suggestedQuantity).toBe(264)
  })

  it('does NOT apply MOQ or pack rounding when stock is sufficient (zero suggestion)', () => {
    // High available stock: 300 units.
    // targetStock = 255. Deficit <= 0.
    const wellStockedItem: CanonicalInventoryItem = {
      ...baseItem,
      quantities: {
        ...baseItem.quantities,
        available: 300,
      },
    }

    const rec = computeReplenishment(wellStockedItem, baseDemand, {
      leadTimeDays: 14,
      safetyStockDays: 7,
      replenishmentCoverageDays: 30,
      inboundArrivalConfirmed: true,
      includeInboundShipped: true,
      includeInboundReceiving: false,
      minOrderQuantity: 100,
      packMultiple: 12,
    })

    expect(rec.rawSuggestedQuantity).toBe(0)
    expect(rec.suggestedQuantity).toBe(0) // Must remain 0! Not MOQ of 100 or pack of 12!
    expect(rec.urgency).toBe('HEALTHY')
  })

  it('flags zero demand with stockCoverDays of null (NEVER Infinity)', () => {
    const zeroDemand: DemandMetrics = {
      ...baseDemand,
      totalShippedUnits: 0,
      dailyDemand: 0,
    }

    const rec = computeReplenishment(baseItem, zeroDemand)
    expect(rec.dailyDemand).toBe(0)
    expect(rec.stockCoverDays).toBeNull() // NOT Infinity
    expect(rec.suggestedQuantity).toBe(0)
  })

  it('returns urgency: UNAVAILABLE when critical stock or demand is unknown', () => {
    const unknownStockItem: CanonicalInventoryItem = {
      ...baseItem,
      quantities: {
        ...baseItem.quantities,
        available: null, // Unknown stock
      },
    }

    const rec = computeReplenishment(unknownStockItem, baseDemand)
    expect(rec.urgency).toBe('UNAVAILABLE')
    expect(rec.suggestedQuantity).toBeNull()
    expect(rec.unavailableReasons.length).toBeGreaterThan(0)
    expect(rec.unavailableReasons[0]).toContain('Usable sellable stock is unknown')
  })

  it('flags CRITICAL_REORDER when usable stock will run out before lead time', () => {
    // Daily demand = 5, lead time = 14 days.
    // Stock required during lead time = 70 units.
    // Usable stock is only 20 units (will run out in 4 days!).
    const lowStockItem: CanonicalInventoryItem = {
      ...baseItem,
      quantities: {
        ...baseItem.quantities,
        available: 20,
      },
    }

    const rec = computeReplenishment(lowStockItem, baseDemand, {
      leadTimeDays: 14,
      safetyStockDays: 7,
      replenishmentCoverageDays: 30,
      inboundArrivalConfirmed: true,
      includeInboundShipped: true,
      includeInboundReceiving: false,
    })

    expect(rec.urgency).toBe('CRITICAL_REORDER')
    expect(rec.daysUntilStockout).toBe(7) // (20 + 15 qualifying) / 5 = 7 days
  })

  it('correctly respects qualifying inbound settings', () => {
    // Working = 5, Shipped = 15, Receiving = 10
    const itemWithReceiving: CanonicalInventoryItem = {
      ...baseItem,
      quantities: {
        ...baseItem.quantities,
        inboundBreakdown: {
          working: 5,
          shipped: 15,
          receiving: 10,
          total: 30,
        },
      },
    }

    // Default: shipped (15) + receiving (10) = 25
    const q1 = calculateQualifyingInbound(itemWithReceiving, {
      leadTimeDays: 14,
      safetyStockDays: 7,
      replenishmentCoverageDays: 30,
      inboundArrivalConfirmed: true,
      includeInboundShipped: true,
      includeInboundReceiving: true,
      includeInboundWorking: false,
    })
    expect(q1).toBe(25)

    // With working included: 15 + 10 + 5 = 30
    const q2 = calculateQualifyingInbound(itemWithReceiving, {
      leadTimeDays: 14,
      safetyStockDays: 7,
      replenishmentCoverageDays: 30,
      inboundArrivalConfirmed: true,
      includeInboundShipped: true,
      includeInboundReceiving: true,
      includeInboundWorking: true,
    })
    expect(q2).toBe(30)
  })
})
