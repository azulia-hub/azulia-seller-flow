import { describe, expect, it } from 'vitest'
import { computePulseScoreboard } from './pulseScoreboard'
import type { CanonicalFinancialEvent } from '../data/types'

describe('Pulse Scoreboard calculation', () => {
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

  const events: CanonicalFinancialEvent[] = [
    // Today event (2026-11-09)
    {
      ...baseEvent,
      id: 'tx-1',
      date: '2026-11-09T08:00:00Z',
      amount: 1000,
      orderId: 'ORD-1',
      sku: 'SKU-A',
      quantity: 2,
    },
    // Yesterday event (2026-11-08)
    {
      ...baseEvent,
      id: 'tx-2',
      date: '2026-11-08T14:00:00Z',
      amount: 1500,
      orderId: 'ORD-2',
      sku: 'SKU-B',
      quantity: 3,
    },
    // Earlier this month (2026-11-02)
    {
      ...baseEvent,
      id: 'tx-3',
      date: '2026-11-02T10:00:00Z',
      amount: 2500,
      orderId: 'ORD-3',
      sku: 'SKU-A',
      quantity: 5,
    },
    // Prior month event (2026-10-25)
    {
      ...baseEvent,
      id: 'tx-4',
      date: '2026-10-25T11:00:00Z',
      amount: 4000,
      orderId: 'ORD-4',
      sku: 'SKU-A',
      quantity: 8,
    },
  ]

  const costs = [
    { sku: 'SKU-A', unitCost: 200, updatedAt: '' },
    { sku: 'SKU-B', unitCost: 300, updatedAt: '' },
  ]

  it('correctly partitions events into Today, Yesterday, This Month and Forecast', () => {
    const scoreboard = computePulseScoreboard({
      events,
      costs,
      missingCostPolicy: 'ASSUME_ZERO',
      anchorDate: '2026-11-09',
    })

    expect(scoreboard.today.grossSales).toBe(1000)
    expect(scoreboard.today.ordersCount).toBe(1)
    expect(scoreboard.today.unitsSold).toBe(2)

    expect(scoreboard.yesterday.grossSales).toBe(1500)
    expect(scoreboard.yesterday.ordersCount).toBe(1)
    expect(scoreboard.yesterday.unitsSold).toBe(3)

    // This month is 2026-11-01 through 2026-11-09 (tx-1: 1000 + tx-2: 1500 + tx-3: 2500 = 5000)
    expect(scoreboard.thisMonth.grossSales).toBe(5000)
    expect(scoreboard.thisMonth.ordersCount).toBe(3)
    expect(scoreboard.thisMonth.unitsSold).toBe(10)

    // Forecast extrapolates 9 days to 30 days (November has 30 days)
    // multiplier = 30 / 9 = 3.333
    // 5000 * (30/9) = ~16667
    expect(scoreboard.forecast.grossSales).toBe(16667)
    expect(scoreboard.forecast.ordersCount).toBe(10) // 3 * 3.333 ~ 10
  })

  it('correctly tracks pending orders and sales when Amazon has not yet posted financial settlement events', () => {
    // Scenario: Today and Yesterday have orders placed by buyers (Unshipped/Pending),
    // but Amazon Finances API has not generated financial events yet.
    const sourceOrders = [
      { orderId: 'ORD-PENDING-TODAY-1', purchaseDate: '2026-11-09T03:00:00Z', status: 'Unshipped', orderValue: '649.00' },
      { orderId: 'ORD-PENDING-TODAY-2', purchaseDate: '2026-11-09T05:30:00Z', status: 'Pending', orderValue: '550.00' },
      { orderId: 'ORD-CANCELED-TODAY', purchaseDate: '2026-11-09T06:00:00Z', status: 'Canceled', orderValue: '999.00' },
      { orderId: 'ORD-PENDING-YESTERDAY-1', purchaseDate: '2026-11-08T10:00:00Z', status: 'Unshipped', orderValue: '1200.00' },
      { orderId: 'ORD-PENDING-YESTERDAY-2', purchaseDate: '2026-11-08T12:00:00Z', status: 'Unshipped', orderValue: '850.50' },
    ]

    const scoreboard = computePulseScoreboard({
      events: [], // No financial events posted yet by Amazon for these new orders
      costs,
      missingCostPolicy: 'ASSUME_ZERO',
      sourceOrders,
      anchorDate: '2026-11-09',
    })

    // Today: 2 active orders (canceled excluded), total pending sales 649 + 550 = 1199
    expect(scoreboard.today.ordersCount).toBe(2)
    expect(scoreboard.today.pendingOrdersCount).toBe(2)
    expect(scoreboard.today.grossSales).toBe(0)
    expect(scoreboard.today.pendingSales).toBe(1199)

    // Yesterday: 2 active orders, pending sales 1200 + 850.50 = 2050.50
    expect(scoreboard.yesterday.ordersCount).toBe(2)
    expect(scoreboard.yesterday.pendingOrdersCount).toBe(2)
    expect(scoreboard.yesterday.grossSales).toBe(0)
    expect(scoreboard.yesterday.pendingSales).toBe(2050.5)

    // This month combines active orders
    expect(scoreboard.thisMonth.ordersCount).toBe(4)
    expect(scoreboard.thisMonth.pendingOrdersCount).toBe(4)
    expect(scoreboard.thisMonth.pendingSales).toBe(3249.5)

    // Forecast extrapolates based on pending sales when gross sales is 0
    // multiplier = 30 / 9 = 3.3333...
    // 3249.5 * (30/9) = ~10832
    expect(scoreboard.forecast.grossSales).toBe(10832)
    expect(scoreboard.forecast.ordersCount).toBe(13) // 4 * (30/9) = 13.33 -> 13
  })
})
