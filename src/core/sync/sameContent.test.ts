import { expect, it } from 'vitest'
import { sameContent } from './sameContent'

it('ignores object-key ordering at every depth while preserving all field values', () => {
  expect(sameContent({ amount: '10.00', extra: { code: 'new', enabled: false } }, { extra: { enabled: false, code: 'new' }, amount: '10.00' })).toBe(true)
  expect(sameContent({ extra: { code: 'new' } }, { extra: { code: 'changed' } })).toBe(false)
  expect(sameContent({ amount: '10.00' }, { amount: 10 })).toBe(false)
  expect(sameContent({ amount: null }, {})).toBe(false)
})

it('preserves meaningful array order and distinguishes array/object and missing elements', () => {
  expect(sameContent([{ id: 'A', amount: 10 }], [{ amount: 10, id: 'A' }])).toBe(true)
  expect(sameContent(['A', 'B'], ['B', 'A'])).toBe(false)
  expect(sameContent([], {})).toBe(false)
  expect(sameContent([null], [])).toBe(false)
  expect(sameContent(null, {})).toBe(false)
})
