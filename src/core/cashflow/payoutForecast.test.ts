import { describe, expect, it } from 'vitest'
import { forecastCashSettlements } from './payoutForecast'
import type { CanonicalFinancialEvent } from '../data/types'

describe('cash settlement and bank payout forecast', () => {
  const baseEvent = {
    source: 'amazon',
    sourceDatasetId: 'ds-1',
    sourceRow: 1,
    classified: true,
    state: null,
    city: null,
    status: null,
    rawType: 'Order',
    rawDescription: null,
    raw: {},
  }

  it('calculates unsettled balance, reserve, and next payout date', () => {
    const events: CanonicalFinancialEvent[] = [
      // Past settlement transfer 10 days ago
      {
        ...baseEvent,
        id: 'settle-1',
        date: '2026-10-30',
        event: 'SETTLEMENT',
        amountClass: 'SETTLEMENT',
        amountType: 'OTHER',
        amount: -50000,
        sku: null,
        orderId: null,
        quantity: null,
      },
      // Operating sale posted since last settlement
      {
        ...baseEvent,
        id: 'sale-1',
        date: '2026-11-05',
        event: 'SALE',
        amountClass: 'OPERATING',
        amountType: 'PRODUCT_REVENUE',
        amount: 10000,
        sku: 'SKU-A',
        orderId: 'ORD-1',
        quantity: 5,
      },
      {
        ...baseEvent,
        id: 'fee-1',
        date: '2026-11-05',
        event: 'FEE',
        amountClass: 'OPERATING',
        amountType: 'COMMISSION',
        amount: -1500,
        sku: 'SKU-A',
        orderId: 'ORD-1',
        quantity: null,
      },
    ]

    const forecast = forecastCashSettlements(events, '2026-11-09')

    expect(forecast.currentUnsettledBalance).toBe(8500) // 10000 - 1500
    expect(forecast.estimatedReserveAmount).toBeGreaterThanOrEqual(0)
    expect(forecast.nextEstimatedPayoutAmount).toBeGreaterThan(0)
    expect(forecast.rollingWeeklyForecast.length).toBe(4)
    expect(forecast.nextEstimatedPayoutDate).toBe('2026-11-13')
  })
})
