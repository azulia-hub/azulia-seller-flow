import { describe, expect, it } from 'vitest'
import {
  buildShippedPointsFromOrders,
  calculateDemandMetrics,
} from './demand'
import type { ShippedDayPoint } from './types'

describe('Inventory demand calculation', () => {
  it('calculates average daily demand across observed days', () => {
    const points: ShippedDayPoint[] = [
      { date: '2026-11-01', shippedUnits: 10, isStocked: true },
      { date: '2026-11-02', shippedUnits: 15, isStocked: true },
      { date: '2026-11-03', shippedUnits: 5, isStocked: true },
    ]

    const result = calculateDemandMetrics(points, 7)
    expect(result.observedDays).toBe(3)
    expect(result.totalShippedUnits).toBe(30)
    // 30 / 3 = 10 units/day
    expect(result.dailyDemand).toBe(10)
    expect(result.stockoutDaysCount).toBe(0)
    expect(result.hasStockoutBias).toBe(false)
    expect(result.confidence).toBe('INSUFFICIENT_HISTORY') // 3/7 < 0.5
  })

  it('detects stockout bias when usable stock was 0 during observed days', () => {
    const points: ShippedDayPoint[] = [
      { date: '2026-11-01', shippedUnits: 12, isStocked: true },
      { date: '2026-11-02', shippedUnits: 0, isStocked: false }, // out of stock!
      { date: '2026-11-03', shippedUnits: 0, isStocked: false }, // out of stock!
      { date: '2026-11-04', shippedUnits: 8, isStocked: true },
    ]

    const result = calculateDemandMetrics(points, 7)
    expect(result.stockoutDaysCount).toBe(2)
    expect(result.hasStockoutBias).toBe(true)
    expect(result.confidence).toBe('STOCKOUT_BIASED')
    expect(result.notes.some(n => n.includes('Demand may be understated'))).toBe(true)
  })

  it('does not produce infinite stock cover or divide by zero when demand is zero', () => {
    const points: ShippedDayPoint[] = [
      { date: '2026-11-01', shippedUnits: 0, isStocked: true },
      { date: '2026-11-02', shippedUnits: 0, isStocked: true },
    ]

    const result = calculateDemandMetrics(points, 7)
    expect(result.totalShippedUnits).toBe(0)
    expect(result.dailyDemand).toBe(0)
    expect(result.confidence).toBe('NO_OBSERVED_SALES')
  })

  it('handles empty shipment history gracefully without crashing', () => {
    const result = calculateDemandMetrics([], 30)
    expect(result.observedDays).toBe(0)
    expect(result.dailyDemand).toBeNull()
    expect(result.confidence).toBe('NO_DATA')
  })

  it('aggregates multiple orders on the same calendar date', () => {
    const points: ShippedDayPoint[] = [
      { date: '2026-11-05T08:00:00Z', shippedUnits: 4, isStocked: true },
      { date: '2026-11-05T14:30:00Z', shippedUnits: 6, isStocked: true },
    ]

    const result = calculateDemandMetrics(points, 7)
    expect(result.observedDays).toBe(1)
    expect(result.totalShippedUnits).toBe(10)
    expect(result.dailyDemand).toBe(10)
  })

  it('buildShippedPointsFromOrders ignores canceled or pending orders and filters by target SKU', () => {
    const orders = [
      {
        orderId: 'ORD-1',
        shippedDate: '2026-11-10T10:00:00Z',
        status: 'Shipped',
        items: [{ sku: 'SKU-A', quantity: 2 }, { sku: 'SKU-B', quantity: 5 }],
      },
      {
        orderId: 'ORD-2',
        shippedDate: '2026-11-10T12:00:00Z',
        status: 'Delivered',
        items: [{ sku: 'SKU-A', quantity: 3 }],
      },
      {
        orderId: 'ORD-3',
        purchaseDate: '2026-11-10T14:00:00Z',
        status: 'Canceled', // canceled!
        items: [{ sku: 'SKU-A', quantity: 10 }],
      },
      {
        orderId: 'ORD-4',
        purchaseDate: '2026-11-10T15:00:00Z',
        status: 'Pending', // pending authorization!
        items: [{ sku: 'SKU-A', quantity: 4 }],
      },
    ]

    const points = buildShippedPointsFromOrders(orders, 'SKU-A', 30, '2026-11-11T00:00:00Z')
    expect(points.length).toBe(1)
    expect(points[0].date).toBe('2026-11-10')
    // ORD-1 (2) + ORD-2 (3) = 5 units. Canceled and pending are excluded.
    expect(points[0].shippedUnits).toBe(5)
  })
})
