import { describe, expect, it } from 'vitest'
import { predictInventoryRestock } from './restockPredictor'
import type { CanonicalFinancialEvent } from '../data/types'

describe('inventory restock predictor', () => {
  const baseEvent = {
    source: 'amazon',
    sourceDatasetId: 'ds-1',
    sourceRow: 1,
    classified: true,
    amountClass: 'OPERATING' as const,
    amountType: 'PRODUCT_REVENUE' as const,
    event: 'SALE' as const,
    state: null,
    city: null,
    status: null,
    rawType: 'Order',
    rawDescription: null,
    raw: {},
  }

  it('computes daily velocity and flags critical reorders when stock is low', () => {
    // 14 units sold over last 7 days = 2 units / day velocity
    const events: CanonicalFinancialEvent[] = Array.from({ length: 7 }, (_, i) => ({
      ...baseEvent,
      id: `ev-${i}`,
      date: `2026-11-0${i + 2}`,
      amount: 500,
      sku: 'SKU-FAST',
      quantity: 2,
      orderId: `ORD-${i}`,
    }))

    const results = predictInventoryRestock({
      events,
      stockLevels: {
        'SKU-FAST': 6, // 6 units / 2 units-per-day = 3 days of stock!
      },
      leadTimeDays: 7,
      anchorDate: '2026-11-09',
    })

    const status = results.find(s => s.sku === 'SKU-FAST')
    expect(status).toBeDefined()
    expect(status?.activeVelocity).toBe(2)
    expect(status?.daysOfStock).toBe(3)
    expect(status?.urgency).toBe('REORDER_NOW')
    expect(status?.estimatedStockoutDate).toBe('2026-11-12')
    expect(status?.recommendedReorderQty).toBeGreaterThan(0)
  })

  it('identifies out of stock items', () => {
    const events: CanonicalFinancialEvent[] = [
      {
        ...baseEvent,
        id: '1',
        date: '2026-11-08',
        amount: 500,
        sku: 'SKU-OUT',
        quantity: 1,
        orderId: 'ORD-1',
      },
    ]

    const results = predictInventoryRestock({
      events,
      stockLevels: {
        'SKU-OUT': 0,
      },
      anchorDate: '2026-11-09',
    })

    const status = results.find(s => s.sku === 'SKU-OUT')
    expect(status?.urgency).toBe('OUT_OF_STOCK')
  })
})
