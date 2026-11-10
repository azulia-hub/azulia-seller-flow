import { describe, expect, it } from 'vitest'
import { computePulseScoreboard } from './pulseScoreboard'
import { toIndiaDateString, indiaDateToUtcIso } from '../sync/planner'
import { canonicalDateKey } from './dashboardSummary'
import type { CanonicalFinancialEvent } from '../data/types'
import { toUnifiedReport } from '../../adapters/amazon-report-sync/toUnifiedReport'
import type { SyncSnapshot } from '../../adapters/amazon-report-sync/protocol'

describe('Order-period attribution and coverage regression cases', () => {
  it('August purchase + September refund stays in August', () => {
    // 1. Order purchased in August (2026-08-15)
    // Sale occurs in August (+1000 INR)
    // Refund posted in September (2026-09-02) (-1000 INR)
    // Under order-period attribution, both events belong to the August cohort!
    const orderId = '402-1234567-8901234'
    const purchaseDate = '2026-08-15T10:00:00+05:30'

    const saleEvent: CanonicalFinancialEvent = {
      id: 'evt-1',
      date: '2026-08-15T12:00:00+05:30',
      orderId,
      orderPurchaseDate: '2026-08-15',
      sku: 'SKU-AUG',
      event: 'SALE',
      amountType: 'PRODUCT_REVENUE',
      amountClass: 'OPERATING',
      amount: 1000,
      quantity: 1,
      sourceRow: 1,
      state: null,
      city: null,
      status: 'Shipped',
      rawType: 'Shipment',
      rawDescription: 'Product sale',
      classified: true,
    }

    const refundEvent: CanonicalFinancialEvent = {
      id: 'evt-2',
      date: '2026-09-02T14:00:00+05:30', // posted in September!
      orderId,
      orderPurchaseDate: '2026-08-15', // verified August purchase date!
      sku: 'SKU-AUG',
      event: 'REFUND',
      amountType: 'PRODUCT_REVENUE',
      amountClass: 'OPERATING',
      amount: -1000,
      quantity: -1,
      sourceRow: 2,
      state: null,
      city: null,
      status: 'Refunded',
      rawType: 'Refund',
      rawDescription: 'Customer refund',
      classified: true,
    }

    const events = [saleEvent, refundEvent]

    // Scoreboard evaluated for August
    const augustScoreboard = computePulseScoreboard({
      events,
      costs: [],
      missingCostPolicy: 'ZERO',
      sourceOrders: [
        {
          orderId,
          purchaseDate,
          status: 'Shipped',
          orderValue: 1000,
        },
      ],
      anchorDate: '2026-08-31',
    })

    // Both sale and refund must be attributed to August purchase period
    expect(augustScoreboard.thisMonth.from).toBe('2026-08-01')
    expect(augustScoreboard.thisMonth.to).toBe('2026-08-31')
    // Gross sales was 1000
    expect(augustScoreboard.thisMonth.grossSales).toBe(1000)
    expect(augustScoreboard.thisMonth.ordersCount).toBe(1)

    // Scoreboard evaluated for September
    const septemberScoreboard = computePulseScoreboard({
      events,
      costs: [],
      missingCostPolicy: 'ZERO',
      sourceOrders: [
        {
          orderId,
          purchaseDate,
          status: 'Shipped',
          orderValue: 1000,
        },
      ],
      anchorDate: '2026-09-10',
    })

    // September purchase period must NOT contain this August order!
    expect(septemberScoreboard.thisMonth.ordersCount).toBe(0)
    expect(septemberScoreboard.thisMonth.totalSales).toBe(0)
  })

  it('partial month coverage is labelled partial when gaps exist in purchaseCoverage', () => {
    // 2. Partial coverage check:
    // Requested: 2026-11-01 to 2026-11-10
    // Cached purchaseCoverage only spans 2026-11-07 to 2026-11-10 (missing Nov 1 to 7)
    const partialCoverage = [
      { from: '2026-11-06T18:30:00.000Z', to: '2026-11-10T18:30:00.000Z' }, // 7 Nov to 10 Nov IST
    ]

    const scoreboard = computePulseScoreboard({
      events: [],
      costs: [],
      missingCostPolicy: 'ZERO',
      sourceOrders: [],
      anchorDate: '2026-11-10',
      purchaseCoverage: partialCoverage,
    })

    // "This Month" (Nov 1 to Nov 10) must be flagged as partial coverage!
    expect(scoreboard.thisMonth.isPartialCoverage).toBe(true)

    // With complete coverage from 2026-10-31T18:30:00.000Z to 2026-11-10T18:30:00.000Z
    const fullCoverage = [
      { from: '2026-10-31T18:30:00.000Z', to: '2026-11-10T18:30:00.000Z' },
    ]

    const completeScoreboard = computePulseScoreboard({
      events: [],
      costs: [],
      missingCostPolicy: 'ZERO',
      sourceOrders: [],
      anchorDate: '2026-11-10',
      purchaseCoverage: fullCoverage,
    })

    expect(completeScoreboard.thisMonth.isPartialCoverage).toBe(false)
  })

  it('India midnight date boundaries do not shift between UTC and IST', () => {
    // 3. India calendar boundary verification:
    // 1 Nov 2026 00:00:00 IST is 31 Oct 2026 18:30:00 UTC.
    const nov1StartUtc = indiaDateToUtcIso('2026-11-01')
    expect(nov1StartUtc).toBe('2026-10-31T18:30:00.000Z')

    // Converting back from UTC ISO string must yield 2026-11-01, NEVER 2026-10-31
    const convertedBack = toIndiaDateString(nov1StartUtc)
    expect(convertedBack).toBe('2026-11-01')

    // 10 Nov 2026 23:59:59.999 IST is 10 Nov 2026 18:29:59.999 UTC
    const nov10EndUtc = indiaDateToUtcIso('2026-11-10', true)
    expect(nov10EndUtc).toBe('2026-11-10T18:29:59.999Z')

    const convertedEndBack = toIndiaDateString(nov10EndUtc)
    expect(convertedEndBack).toBe('2026-11-10')

    // 2:00 AM IST on 10 Nov (which is 20:30 UTC on 9 Nov)
    const earlyMorningIst = '2026-11-09T20:30:00.000Z'
    expect(toIndiaDateString(earlyMorningIst)).toBe('2026-11-10')
    expect(canonicalDateKey(earlyMorningIst)).toBe('2026-11-10')
  })

  it('identical fixtures produce identical local/hosted canonical records and financial totals', () => {
    // 4. Parity test between local and hosted canonical adapter
    const fixtureSnapshot: SyncSnapshot = {
      connectionKey: 'test-account-parity',
      revision: 1,
      updatedAt: '2026-11-10T12:00:00.000Z',
      coverage: [{ from: '2026-10-31T18:30:00.000Z', to: '2026-11-10T18:30:00.000Z' }],
      orders: [
        {
          id: '407-4079134-5050764',
          purchased: '2026-11-10T06:36:48.000Z',
          status: 'Unshipped',
          fulfillmentType: 'MFN',
          orderValue: '3514.05',
          currency: 'INR',
          sku: 'Wall-Aayatul-Kursi',
          title: 'AZULIA Aayatul Kursi Islamic Wall Art',
          items: [
            {
              asin: 'B08XYZ1234',
              sku: 'Wall-Aayatul-Kursi',
              title: 'AZULIA Aayatul Kursi Islamic Wall Art',
              quantity: 1,
              price: '3514.05',
              currency: 'INR',
            },
          ],
        },
      ],
      records: [
        {
          transactionId: 'TX-1001',
          transactionType: 'Shipment',
          transactionStatus: 'DEFERRED',
          postedDate: '2026-11-10T07:00:00.000Z',
          totalAmount: { currencyAmount: '3514.05', currencyCode: 'INR' },
          relatedIdentifiers: [
            { relatedIdentifierName: 'ORDER_ID', relatedIdentifierValue: '407-4079134-5050764' },
          ],
          items: [
            {
              totalAmount: { currencyAmount: '3514.05', currencyCode: 'INR' },
              contexts: [{ contextType: 'ProductContext', asin: 'B08XYZ1234', sku: 'Wall-Aayatul-Kursi', quantityShipped: 1 }],
              breakdowns: [
                {
                  breakdownType: 'ProductCharges',
                  breakdownAmount: { currencyAmount: '3514.05', currencyCode: 'INR' },
                },
              ],
            },
          ],
        },
      ],
    }

    const result = toUnifiedReport(fixtureSnapshot)
    expect(result.dataset.quality.reconciliation.reconciled).toBe(true)
    expect(result.dataset.orders).toHaveLength(1)
    expect(result.dataset.orders[0].orderValue).toBe('3514.05')
    expect(result.dataset.orders[0].title).toBe('AZULIA Aayatul Kursi Islamic Wall Art')

    const scoreboard = computePulseScoreboard({
      events: result.dataset.events,
      costs: [],
      missingCostPolicy: 'ZERO',
      sourceOrders: result.dataset.orders.map(o => ({
        orderId: o.orderId,
        purchaseDate: o.purchaseDate,
        status: o.status,
        orderValue: o.orderValue,
        title: o.title,
        items: o.items,
      })),
      anchorDate: '2026-11-10',
    })

    // Verified today sales equals orderValue exactly
    expect(scoreboard.today.totalSales).toBe(3514.05)
    expect(scoreboard.today.ordersCount).toBe(1)
  })
})
