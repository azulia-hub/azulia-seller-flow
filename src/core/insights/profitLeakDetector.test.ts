import { describe, expect, it } from 'vitest'
import { detectProfitLeaks } from './profitLeakDetector'
import type { CanonicalFinancialEvent } from '../data/types'

describe('profit leak and anomaly detector', () => {
  const baseEvent = {
    source: 'amazon',
    sourceDatasetId: 'ds-1',
    sourceRow: 1,
    classified: true,
    amountClass: 'OPERATING' as const,
    state: null,
    city: null,
    status: null,
    rawType: 'Order',
    rawDescription: null,
    raw: {},
  }

  it('detects bleeding products losing money after COGS and fees', () => {
    const events: CanonicalFinancialEvent[] = [
      {
        ...baseEvent,
        id: '1',
        date: '2026-11-01',
        event: 'SALE',
        amountType: 'PRODUCT_REVENUE',
        amount: 1000,
        sku: 'LOSING-SKU',
        quantity: 2,
        orderId: 'ORD-1',
      },
      {
        ...baseEvent,
        id: '2',
        date: '2026-11-01',
        event: 'FEE',
        amountType: 'COMMISSION',
        amount: -400,
        sku: 'LOSING-SKU',
        quantity: null,
        orderId: 'ORD-1',
      },
      {
        ...baseEvent,
        id: '3',
        date: '2026-11-01',
        event: 'FEE',
        amountType: 'ADVERTISING_FEE',
        amount: -500,
        sku: 'LOSING-SKU',
        quantity: null,
        orderId: 'ORD-1',
      },
    ]

    // COGS is 2 * 300 = 600.
    // Revenue = 1000, fees = -400, ads = -500. Operating net = 100.
    // Net profit = 100 - 600 = -500 (Loss!)
    const costs = [{ sku: 'LOSING-SKU', unitCost: 300, updatedAt: '' }]

    const alerts = detectProfitLeaks({
      events,
      costs,
      missingCostPolicy: 'ASSUME_ZERO',
    })

    expect(alerts.length).toBeGreaterThanOrEqual(1)
    const bleedingAlert = alerts.find(a => a.type === 'BLEEDING_SKU')
    expect(bleedingAlert).toBeDefined()
    expect(bleedingAlert?.severity).toBe('CRITICAL')
    expect(bleedingAlert?.impactAmount).toBe(500)
  })

  it('detects high return rates draining profit', () => {
    const events: CanonicalFinancialEvent[] = [
      ...Array.from({ length: 10 }, (_, i) => ({
        ...baseEvent,
        id: `sale-${i}`,
        date: '2026-11-01',
        event: 'SALE' as const,
        amountType: 'PRODUCT_REVENUE' as const,
        amount: 500,
        sku: 'HIGH-RETURN-SKU',
        quantity: 1,
        orderId: `ORD-SALE-${i}`,
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        ...baseEvent,
        id: `refund-${i}`,
        date: '2026-11-05',
        event: 'REFUND' as const,
        amountType: 'PRODUCT_REVENUE' as const,
        amount: -500,
        sku: 'HIGH-RETURN-SKU',
        quantity: 1,
        orderId: `ORD-REF-${i}`,
      })),
    ]

    // 3 returns out of 10 sold = 30% return rate
    const alerts = detectProfitLeaks({
      events,
      costs: [{ sku: 'HIGH-RETURN-SKU', unitCost: 100, updatedAt: '' }],
      missingCostPolicy: 'ASSUME_ZERO',
    })

    const returnAlert = alerts.find(a => a.type === 'HIGH_RETURNS')
    expect(returnAlert).toBeDefined()
    expect(returnAlert?.metricDelta).toContain('30%')
  })
})
