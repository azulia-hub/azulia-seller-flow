import { describe, expect, it } from 'vitest'
import type { CanonicalFinancialEvent } from '../data/types'
import { canonicalDateKey, filterEvents, summarizeDashboard } from './dashboardSummary'

const base = { id: '', source: 'x', sourceDatasetId: 'x', sourceRow: 1, date: null, orderId: null, sku: 'A', quantity: 2, amountClass: 'OPERATING' as const, state: null, city: null, status: null, rawType: '', rawDescription: null, classified: true, raw: {} }
const events: CanonicalFinancialEvent[] = [
  { ...base, id: 'sale', event: 'SALE', amount: 100, amountType: 'PRODUCT_REVENUE' },
  { ...base, id: 'refund', event: 'REFUND', quantity: 1, amount: -30, amountType: 'PRODUCT_REVENUE' },
  { ...base, id: 'fee', event: 'FEE', amount: -10, amountType: 'OTHER_FEE' },
  { ...base, id: 'ads', event: 'FEE', amount: -20, amountType: 'ADVERTISING_FEE', rawDescription: 'Cost of Advertising' },
  { ...base, id: 'ship', event: 'FEE', amount: -15, amountType: 'SHIPPING_FEE' },
  { ...base, id: 'ship-reversal', event: 'FEE', amount: 5, amountType: 'SHIPPING_FEE' },
  { ...base, id: 'commission', event: 'FEE', amount: -7, amountType: 'COMMISSION' },
  { ...base, id: 'reimbursement', event: 'REIMBURSEMENT', amount: 8, amountType: 'OTHER' },
  { ...base, id: 'tax', event: 'TAX', amount: 18, amountType: 'TAX' },
  { ...base, id: 'transfer', event: 'SETTLEMENT', amount: -60, amountClass: 'SETTLEMENT', amountType: 'OTHER' },
]

describe('dashboard summary', () => {
  it('uses canonical events and excludes settlements from operating net', () => {
    expect(summarizeDashboard(events)).toMatchObject({
      grossSales: 100, netProductRevenue: 70, soldQuantity: 2, returnQuantity: 1,
      returnRate: 50, operatingNet: 49, adsSpend: 20, tacos: 20,
      averageSellingPrice: 50, reimbursements: 8, netEasyShipFee: 10, marketplaceCharges: 17,
      refundValue: 30, taxNet: 18, netDeliveredQuantity: 1, roas: 5,
    })
  })

  it('filters named and ISO dates using inclusive boundaries', () => {
    const dated = [
      { ...events[0], id: 'before', date: '31 Jul 2026 11:00:00 pm UTC' },
      { ...events[0], id: 'from', date: '1 Aug 2026 1:00:00 am UTC' },
      { ...events[0], id: 'to', date: '2026-08-05T22:00:00Z' },
      { ...events[0], id: 'after', date: '6 Aug 2026 1:00:00 am UTC' },
    ]
    expect(canonicalDateKey(dated[1].date)).toBe('2026-08-01')
    expect(filterEvents(dated, { fromDate: '2026-08-01', toDate: '2026-08-05' }).map((event) => event.id)).toEqual(['from', 'to'])
  })
})
