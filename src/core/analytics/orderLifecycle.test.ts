import { describe, expect, it } from 'vitest'
import type { CanonicalFinancialEvent } from '../data/types'
import { buildCompletedOrderCohort } from './orderLifecycle'

function event(id: string, date: string, orderId: string | null, kind: CanonicalFinancialEvent['event'], amount: number, amountType: CanonicalFinancialEvent['amountType'] = 'PRODUCT_REVENUE', status = 'Released'): CanonicalFinancialEvent {
  return { id, source: 'test', sourceDatasetId: 'dataset', sourceRow: 1, date, orderId, sku: orderId ? 'SKU-1' : null, event: kind, quantity: 1, amount, amountClass: 'OPERATING', amountType, state: null, city: null, status, rawType: kind, rawDescription: null, classified: true, raw: {} }
}

describe('buildCompletedOrderCohort', () => {
  it('selects orders by sale date and brings later lifecycle events back to that cohort', () => {
    const events = [
      event('sale-aug', '2026-08-10', 'AUG', 'SALE', 1000),
      event('fee-aug', '2026-08-10', 'AUG', 'FEE', -100, 'COMMISSION'),
      event('refund-sep', '2026-09-02', 'AUG', 'REFUND', -1000),
      event('reimbursement-sep', '2026-09-05', 'AUG', 'REIMBURSEMENT', 150, 'OTHER'),
      event('global-aug', '2026-08-15', null, 'FEE', -50, 'ADVERTISING_FEE'),
      event('coverage', '2026-09-30', null, 'OTHER', 0, 'OTHER'),
    ]
    const result = buildCompletedOrderCohort(events, { from: '2026-08-01', to: '2026-08-31' }, 20)
    expect(result.completedOrderCount).toBe(1)
    expect(result.events.map(item => item.id)).toEqual(['sale-aug', 'fee-aug', 'refund-sep', 'reimbursement-sep', 'global-aug'])
    expect(result).toMatchObject({ completedSales: 1000, includedOrderCharges: 100, includedRefundValue: 1000, includedReimbursements: 150, excludedRefundValue: 0, excludedOrderCharges: 0, excludedReimbursements: 0 })
  })

  it('excludes activity whose original sale is missing while preserving it as evidence', () => {
    const result = buildCompletedOrderCohort([
      event('july-refund', '2026-08-04', 'JULY', 'REFUND', -700),
      event('coverage', '2026-09-30', null, 'FEE', -10, 'ADVERTISING_FEE'),
    ], { from: '2026-08-01', to: '2026-08-31' }, 20)
    expect(result.events).toEqual([])
    expect(result.missingSaleOrderCount).toBe(1)
    expect(result.missingSale[0].status).toBe('INCOMPLETE_MISSING_SALE')
    expect(result.excludedRefundValue).toBe(700)
  })

  it('excludes recent and deferred orders until their lifecycle is complete', () => {
    const result = buildCompletedOrderCohort([
      event('old', '2026-08-01', 'OLD', 'SALE', 100),
      event('recent', '2026-08-25', 'RECENT', 'SALE', 200),
      event('deferred', '2026-08-02', 'DEFERRED', 'SALE', 300, 'PRODUCT_REVENUE', 'Deferred'),
      event('coverage', '2026-09-05', null, 'FEE', 0, 'OTHER_FEE'),
    ], { from: '2026-08-01', to: '2026-08-31' }, 20)
    expect(result.completed.map(item => item.orderId)).toEqual(['OLD'])
    expect(result.incomplete.map(item => item.status).sort()).toEqual(['INCOMPLETE_COVERAGE', 'INCOMPLETE_DEFERRED'])
    expect(result.orderCoveragePercent).toBeCloseTo(100 / 3)
    expect(result.salesCoveragePercent).toBeCloseTo(100 / 6)
  })

  it('does not pull a known prior-period order into the selected cohort', () => {
    const result = buildCompletedOrderCohort([
      event('july-sale', '2026-07-20', 'JULY', 'SALE', 500),
      event('aug-refund', '2026-08-03', 'JULY', 'REFUND', -500),
      event('coverage', '2026-09-30', null, 'OTHER', 0, 'OTHER'),
    ], { from: '2026-08-01', to: '2026-08-31' }, 20)
    expect(result.candidateOrderCount).toBe(0)
    expect(result.missingSaleOrderCount).toBe(0)
    expect(result.events).toEqual([])
  })
})
