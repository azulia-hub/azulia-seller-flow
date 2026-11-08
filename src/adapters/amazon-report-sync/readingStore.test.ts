import { expect, it, vi } from 'vitest'
import { saveImport } from '../browser/importStore'
import { advanceReading, saveReading } from './readingStore'
import { toUnifiedReport } from './toUnifiedReport'

vi.mock('../browser/importStore', () => ({ saveImport: vi.fn(async () => {}), loadImports: vi.fn(async () => []) }))

it('saves an acknowledged revision without replacing data, profiling again or changing calculation time', async () => {
  const value = toUnifiedReport({ connectionKey: 'account', revision: 1, updatedAt: null, records: [], orders: [], coverage: [] })
  const original = await saveReading('account', 1, value, [], [])
  vi.mocked(saveImport).mockClear()
  const advanced = await advanceReading(original, 2, [])
  expect(advanced.revision).toBe(2)
  expect(original.revision).toBe(1)
  expect(advanced.dataset).toBe(original.dataset)
  expect(advanced.profile).toBe(original.profile)
  expect(advanced.raw).toBe(original.raw)
  expect(advanced.importedAt).toBe(original.importedAt)
  expect(saveImport).toHaveBeenCalledExactlyOnceWith(advanced)
})
