import { describe, expect, it } from 'vitest'
import type { CanonicalFinancialEvent } from '../data/types'
import { buildOrderCohort, buildCohortFinancials } from './orderLifecycle'
import { filterEvents, summarizeDashboard } from './dashboardSummary'

let row = 0
function event(id: string, date: string, orderId: string | null, kind: CanonicalFinancialEvent['event'], amount: number, amountType: CanonicalFinancialEvent['amountType'] = 'PRODUCT_REVENUE', status: string | null = 'Released'): CanonicalFinancialEvent {
  return { id, source: 'test', sourceDatasetId: 'dataset', sourceRow: ++row, date, orderId, sku: orderId ? 'SKU-1' : null, event: kind, quantity: 1, amount, amountClass: 'OPERATING', amountType, state: null, city: null, status, rawType: kind, rawDescription: null, classified: true, raw: {} }
}
const august = { from: '2026-08-01', to: '2026-08-31' }
const costs = [{ sku: 'SKU-1', unitCost: 300, updatedAt: '' }]

describe('sale-period order analysis', () => {
  it('includes late refunds and reimbursements without waiting or adding later sales', () => {
    const events = [event('sale', '2026-08-31', 'A', 'SALE', 1000), event('refund', '2026-09-05', 'A', 'REFUND', -1000), event('claim', '2026-10-14', 'A', 'REIMBURSEMENT', 100, 'OTHER'), event('september-sale', '2026-09-05', 'B', 'SALE', 500)]
    const result = buildOrderCohort(events, august)
    expect(result.orders).toHaveLength(1)
    expect(result.events.map(e => e.id)).toEqual(['sale', 'refund', 'claim'])
    const financials = buildCohortFinancials(result, costs, 'BLOCK')
    expect(financials.released).toMatchObject({ grossSales: 1000, refundValue: 1000, reimbursements: 100, netCogs: 0, profit: 100 })
  })

  it('keeps recent released sales even when follow-up is zero days', () => {
    const result = buildOrderCohort([event('sale', '2026-08-31', 'A', 'SALE', 1000)], august)
    expect(result.events).toHaveLength(1)
    expect(result.orders[0].followUpDays).toBe(0)
    expect(result.limitedFollowUpOrderCount).toBe(1)
  })

  it('separates a pending refund and fees without removing the released sale', () => {
    const result = buildOrderCohort([event('sale', '2026-08-31', 'A', 'SALE', 1000), event('refund', '2026-09-05', 'A', 'REFUND', -1000, 'PRODUCT_REVENUE', 'Deferred'), event('fee', '2026-09-06', 'A', 'FEE', -25, 'COMMISSION', 'Deferred')], august)
    expect(result.events.map(e => e.id)).toEqual(['sale'])
    expect(result.pendingOrderCount).toBe(1)
    const financials = buildCohortFinancials(result, costs, 'BLOCK')
    expect(financials.released).toMatchObject({ grossSales: 1000, netCogs: 300, profit: 700 })
    expect(financials.pending).toMatchObject({ refundValue: 1000, charges: 25, operatingNet: -1025 })
    expect(financials.estimated).toMatchObject({ grossSales: 1000, refundValue: 1000, netCogs: 0, profit: -25 })
  })

  it('shows deferred sales only as pending and respects the missing-cost policy', () => {
    const result = buildOrderCohort([event('sale', '2026-08-31', 'A', 'SALE', 1000, 'PRODUCT_REVENUE', 'Deferred')], august)
    expect(result.orders).toHaveLength(1)
    expect(result.events).toEqual([])
    const financials = buildCohortFinancials(result, costs, 'BLOCK')
    expect(financials.released.grossSales).toBe(0)
    expect(financials.pending.grossSales).toBe(1000)
    expect(financials.estimated.profit).toBe(700)
    expect(buildCohortFinancials(result, [], 'BLOCK').estimated.profit).toBeNull()
    expect(buildCohortFinancials(result, [], 'ASSUME_ZERO').estimated).toMatchObject({ profit: 1000, costComplete: false })
  })

  it('keeps missing-origin evidence separate and does not reassign known July sales', () => {
    const result = buildOrderCohort([event('july', '2026-07-20', 'JULY', 'SALE', 500), event('refund', '2026-08-03', 'JULY', 'REFUND', -500), event('missing', '2026-08-04', 'MISSING', 'REFUND', -700)], august)
    expect(result.orders).toEqual([])
    expect(result.events).toEqual([])
    expect(result.missingSale.map(o => o.orderId)).toEqual(['MISSING'])
    expect(result.missingSale[0].events[0].amount).toBe(-700)
  })

  it('uses posting dates for account activity and separates pending settlements from profit', () => {
    const settlement = { ...event('bank', '2026-08-20', null, 'SETTLEMENT', -900, 'OTHER', 'Deferred'), amountClass: 'SETTLEMENT' as const }
    const events = [event('sale', '2026-08-31', 'A', 'SALE', 1000), event('ads', '2026-08-15', null, 'FEE', -50, 'ADVERTISING_FEE'), event('pending-ads', '2026-08-16', null, 'FEE', -20, 'ADVERTISING_FEE', 'Deferred'), event('later-ads', '2026-09-01', null, 'FEE', -80, 'ADVERTISING_FEE'), settlement]
    const result = buildOrderCohort(events, august)
    const financials = buildCohortFinancials(result, costs, 'BLOCK')
    expect(financials.released.profit).toBe(650)
    expect(financials.estimated.profit).toBe(630)
    expect(financials.pending.settlementNet).toBe(-900)
    expect(result.observedEvents.some(e => e.id === 'later-ads')).toBe(false)
    expect(filterEvents(events, {fromDate:august.from,toDate:august.to})).toHaveLength(4)
  })

  it('counts identical deferred/released rows once while preserving source data and multiplicity', () => {
    const deferred = event('pending', '2026-08-31', 'A', 'SALE', 1000, 'PRODUCT_REVENUE', 'Deferred')
    const released = { ...deferred, id: 'released', sourceRow: ++row, status: 'Released' }
    const anotherPending = { ...deferred, id: 'another-pending', sourceRow: ++row }
    const events = [deferred, released, anotherPending]
    const before = JSON.stringify(events)
    const result = buildOrderCohort(events, august)
    expect(result.events.map(e=>e.id)).toEqual(['released'])
    expect(result.pendingEvents.map(e=>e.id)).toEqual(['another-pending'])
    expect(result.supersededEvents.map(e=>e.id)).toEqual(['pending'])
    expect(summarizeDashboard(result.observedEvents).grossSales).toBe(2000)
    expect(JSON.stringify(events)).toBe(before)
    expect(summarizeDashboard(events).grossSales).toBe(3000)
  })

  it('does not guess matches for changed dates, amounts, or partially matching financial rows', () => {
    const pending = event('pending', '2026-08-31', 'A', 'SALE', 1000, 'PRODUCT_REVENUE', 'Deferred')
    const pendingFee = { ...event('pending-fee', '2026-08-31', 'A', 'FEE', -100, 'COMMISSION', 'Deferred'), sourceRow: pending.sourceRow }
    const released = { ...pending, id:'released', sourceRow:++row, status:'Released' }
    const result = buildOrderCohort([pending, pendingFee, released, { ...released, id:'later',sourceRow:++row,date:'2026-09-01' }], august)
    expect(result.supersededEvents).toEqual([])
    expect(result.pendingEvents).toHaveLength(2)
  })

  it('preserves distinct source transaction references when financial values happen to match', () => {
    const pending = {...event('pending', '2026-08-31', 'A', 'SALE', 1000, 'PRODUCT_REVENUE', 'Deferred'),raw:{reference:'first',status:'Deferred'}}
    const released = {...pending,id:'released',sourceRow:++row,status:'Released',raw:{reference:'second',status:'Released'}}
    expect(buildOrderCohort([pending,released],august).pendingEvents).toHaveLength(1)
    const matching = {...released,raw:{reference:'first',status:'Released'}}
    expect(buildOrderCohort([pending,matching],august).pendingEvents).toHaveLength(0)
  })

  it('preserves unknown events and release statuses visibly instead of dropping money', () => {
    const sale = event('sale', '2026-08-31', 'A', 'SALE', 1000, 'PRODUCT_REVENUE', null)
    const unknown = {...event('unknown','2026-10-14','A','UNKNOWN',-13,'UNKNOWN','New status'), classified:false}
    const result = buildOrderCohort([sale,unknown],august)
    expect(result.unspecifiedStatusEventCount).toBe(2)
    expect(result.events).toEqual([sale,unknown])
    expect(buildCohortFinancials(result,costs,'BLOCK').released.profit).toBe(687)
  })

  it('uses original sale costs for a later pending return when cost history changes', () => {
    const result = buildOrderCohort([event('sale','2026-08-31','A','SALE',1000),event('refund','2026-10-01','A','REFUND',-1000,'PRODUCT_REVENUE','Deferred')],august)
    const history = [{sku:'SKU-1',unitCost:300,effectiveFrom:'2026-08-01',updatedAt:''},{sku:'SKU-1',unitCost:500,effectiveFrom:'2026-09-01',updatedAt:''}]
    expect(buildCohortFinancials(result,history,'BLOCK').estimated.netCogs).toBe(0)
  })
})
