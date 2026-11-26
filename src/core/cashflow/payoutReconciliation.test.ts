import { expect, it } from 'vitest'
import { payoutReconciliation, settlementActivityByCategory } from './payoutReconciliation'
import { shiftPayoutWeek } from './weeklyPayout'

const group = {
  id: 'cycle', startedAt: '2026-11-16', transferAt: '2026-11-23', open: false,
  transferSucceeded: true, openingMinor: 1000, amountMinor: 6000,
}
const activity = [{ id: 'one', label: 'Sale', postedAt: '2026-11-18', amountMinor: 5000 }]
const credit = { amountMinor: 6000, date: '2026-11-24', reference: 'bank' }

it('compares settleable activity and manually matched bank credit separately', () => {
  expect(payoutReconciliation(group, activity, credit)).toMatchObject({
    calculated: 6000, settlementDifference: 0, bankDifference: 0, bankStatus: 'MATCHED',
  })
  expect(payoutReconciliation({ ...group, bankTransferMinor: 6500 }, activity, credit)).toMatchObject({
    settlementDifference: 0, bankDifference: -500, bankStatus: 'DIFFERENCE',
  })
})

it('keeps missing source data and open cycles unconfirmed', () => {
  expect(payoutReconciliation(group, [])).toMatchObject({ calculated: null, bankStatus: 'AWAITING' })
  expect(payoutReconciliation(group, activity, { ...credit, date: '2026-11-22' }).bankStatus).toBe('DATE_REVIEW')
  expect(payoutReconciliation({ ...group, open: true }, activity, credit).bankStatus).toBe('UNAVAILABLE')
  expect(payoutReconciliation({ ...group, bankTransferMinor: null }, activity, credit).bankStatus).toBe('UNAVAILABLE')
  expect(payoutReconciliation(group, [{ ...activity[0], amountMinor: null }]).settlementDifference).toBeNull()
  expect(shiftPayoutWeek('2026-01-02', -1)).toBe('2025-12-26')
})

it('uses balanced transaction components once and preserves unclassified activity', () => {
  const rows = settlementActivityByCategory([
    { ...activity[0], components: [
      { label: 'Principal', category: 'Sales', amountMinor: 6000 },
      { label: 'Commission', category: 'Fees', amountMinor: -1000 },
    ] },
    { id: 'unknown', label: 'Other', postedAt: '', amountMinor: 45,
      components: [{ label: 'Unbalanced amount', category: 'Sales', amountMinor: 20 }] },
  ])
  expect(rows.map(({ category, total }) => [category, total])).toEqual([
    ['Adjustments and unclassified', 45], ['Fees', -1000], ['Sales', 6000],
  ])
})
