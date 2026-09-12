import { describe, expect, it } from 'vitest'
import { toCsv } from './toCsv'

describe('toCsv', () => {
  it('escapes commas, quotes and missing values', () => {
    expect(toCsv(['SKU', 'Note', 'Cost'], [['A,1', '12" board', 10], ['B', null, 0]]))
      .toBe('SKU,Note,Cost\r\n"A,1","12"" board",10\r\nB,,0')
  })
})
