import { describe, expect, it } from 'vitest'
import { previousEqualRange, recommendTimePeriod, resolveTimePeriod } from './timePeriods'
describe('time period presets', () => {
  it('anchors rolling periods to the report end', () => expect(resolveTimePeriod('LAST_7_DAYS', '2026-08-31')).toMatchObject({ current: { from: '2026-08-25', to: '2026-08-31' }, previous: { from: '2026-08-18', to: '2026-08-24' } }))
  it('uses an equal month-to-date comparison', () => expect(resolveTimePeriod('THIS_MONTH', '2026-08-23')).toMatchObject({ current: { from: '2026-08-01', to: '2026-08-23' }, previous: { from: '2026-07-01', to: '2026-07-23' } }))
  it('recommends from report coverage', () => { expect(recommendTimePeriod('2026-08-01', '2026-08-31')).toBe('LAST_30_DAYS'); expect(recommendTimePeriod('2026-01-01', '2026-08-31')).toBe('THIS_YEAR') })
  it('builds the immediately preceding equal custom period', () => expect(previousEqualRange({ from: '2026-08-10', to: '2026-08-15' })).toEqual({ from: '2026-08-04', to: '2026-08-09' }))
})
