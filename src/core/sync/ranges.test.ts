import { expect, it } from 'vitest'
import { missingRanges, mergeCoverage } from './ranges'
it('requests only older missing history, never completed October again', () => {
  expect(missingRanges({ from: '2026-08-01T00:00:00Z', to: '2026-11-01T00:00:00Z' }, [{ from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00Z' }], 180)).toEqual([{ from: '2026-08-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' }])
})
it('preserves interior gaps and splits only the missing range into bounded source windows', () => {
  const windows = missingRanges({ from: '2026-08-01T00:00:00Z', to: '2026-11-01T00:00:00Z' }, [{ from: '2026-08-01T00:00:00Z', to: '2026-09-01T00:00:00Z' }, { from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00Z' }])
  expect(windows).toEqual([{ from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' }])
  expect(missingRanges({ from: '2026-08-01T00:00:00Z', to: '2026-10-01T00:00:00Z' }, [])).toHaveLength(3)
})
it('merges overlapping coverage without expanding across unrequested gaps', () => {
  expect(mergeCoverage([{ from: '2026-10-02T00:00:00.000Z', to: '2026-10-05T00:00:00.000Z' }, { from: '2026-10-01T00:00:00.000Z', to: '2026-10-03T00:00:00.000Z' }])).toEqual([{ from: '2026-10-01T00:00:00.000Z', to: '2026-10-05T00:00:00.000Z' }])
})
