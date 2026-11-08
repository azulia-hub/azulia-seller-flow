import { describe, expect, it } from 'vitest'
import { findReimbursementClaims } from './reimbursementFinder'
import type { CanonicalFinancialEvent } from '../data/types'

describe('reimbursement and unreturned inventory claim finder', () => {
  const baseEvent = {
    source: 'amazon',
    sourceDatasetId: 'ds-1',
    sourceRow: 1,
    classified: true,
    amountClass: 'OPERATING' as const,
    state: null,
    city: null,
    status: null,
    rawType: 'Refund',
    rawDescription: null,
    raw: {},
  }

  it('identifies unreturned refunds older than 45 days and formats seller support claim', () => {
    const events: CanonicalFinancialEvent[] = [
      // Old refund (60 days ago: 2026-09-10 relative to 2026-11-09)
      {
        ...baseEvent,
        id: 'ref-1',
        date: '2026-09-10',
        event: 'REFUND',
        amountType: 'PRODUCT_REVENUE',
        amount: -1499,
        sku: 'SKU-LOST',
        quantity: 1,
        orderId: '404-1234567-0000001',
      },
      // Recent refund (10 days ago: 2026-10-30 - not yet 45 days)
      {
        ...baseEvent,
        id: 'ref-2',
        date: '2026-10-30',
        event: 'REFUND',
        amountType: 'PRODUCT_REVENUE',
        amount: -899,
        sku: 'SKU-RECENT',
        quantity: 1,
        orderId: '404-1234567-0000002',
      },
      // Old refund that was already reimbursed by Amazon
      {
        ...baseEvent,
        id: 'ref-3',
        date: '2026-09-01',
        event: 'REFUND',
        amountType: 'PRODUCT_REVENUE',
        amount: -1200,
        sku: 'SKU-REIMBURSED',
        quantity: 1,
        orderId: '404-1234567-0000003',
      },
      {
        ...baseEvent,
        id: 'reimb-3',
        date: '2026-09-20',
        event: 'REIMBURSEMENT',
        amountType: 'OTHER',
        amount: 1200,
        sku: 'SKU-REIMBURSED',
        quantity: 1,
        orderId: '404-1234567-0000003',
      },
    ]

    const summary = findReimbursementClaims(events, '2026-11-09', 45)

    expect(summary.totalClaimsCount).toBe(1)
    expect(summary.totalEligibleAmount).toBe(1499)
    expect(summary.claims[0].orderId).toBe('404-1234567-0000001')
    expect(summary.claims[0].daysElapsed).toBe(60)
    expect(summary.claims[0].claimText).toContain('Dear Amazon Seller Support')
    expect(summary.claims[0].claimText).toContain('404-1234567-0000001')
    expect(summary.claims[0].claimText).toContain('SKU-LOST')
  })
})
