import { expect, it } from 'vitest'
import { weeklyPayout, type PayoutGroup } from './weeklyPayout'

const channels = ['COD', 'Electronic']
const labels = new Map([['cod', 'COD'], ['electronic', 'Electronic']])
const cod: PayoutGroup = {
  id: 'cod', startedAt: '2026-11-20T14:01:25Z', transferAt: null,
  open: true, transferSucceeded: false, amountMinor: -26558,
}
const electronic: PayoutGroup = {
  id: 'electronic', startedAt: '2026-11-21T07:34:09Z', transferAt: '2026-11-28T07:34:09Z',
  open: false, transferSucceeded: true, amountMinor: 120000,
}

it('uses the current India week and distinguishes a negative open balance from a sent payout', () => {
  const result = weeklyPayout([cod, electronic, electronic], labels, channels, '2026-11-28', 7)
  expect(result).toMatchObject({ from: '2026-11-23', to: '2026-11-29', totalMinor: 120000, provisional: true })
  expect(result.rows[0].entries).toMatchObject([{ date: '2026-11-27', amountMinor: -26558, expectedMinor: 0 }])
  expect(result.rows[1].entries).toHaveLength(1)
  expect(weeklyPayout([cod, electronic], labels, channels, '2026-11-30', 7).totalMinor).toBeNull()
})

it('withholds the total if a channel is unknown or its positive transfer is unconfirmed', () => {
  expect(weeklyPayout([cod, electronic], new Map([['cod', 'COD']]), channels, '2026-11-28', 7))
    .toMatchObject({ totalMinor: null, unclassifiedCount: 1 })
  expect(weeklyPayout([cod, { ...electronic, transferSucceeded: false }], labels, channels, '2026-11-28', 7).totalMinor).toBeNull()
})

it('assigns a transfer near midnight UTC to the correct India calendar week', () => {
  const lateSunday = { ...electronic, transferAt: '2026-11-29T19:00:00Z' }
  expect(weeklyPayout([lateSunday], labels, channels, '2026-11-30', 7).rows[1].entries)
    .toMatchObject([{ date: '2026-11-30', transferSucceeded: true }])
})
