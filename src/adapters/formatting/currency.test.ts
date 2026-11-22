import { describe, expect, it } from 'vitest'
import { formatInr } from './currency'

describe('shared currency presentation', () => {
  it('preserves grouping, precision and signs across alternating configurations', () => {
    for (const locale of ['en-IN', 'en-US']) for (const decimals of [0, 2]) {
      const reference = new Intl.NumberFormat(locale, { style: 'currency', currency: 'INR', minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      for (const amount of [1234567.89, -42.34, 0]) expect(formatInr(amount, locale, decimals)).toBe(reference.format(amount))
    }
    expect(formatInr(1234567.89)).toBe('₹12,34,567.89')
  })
  it('displays signed zero as zero without rounding the source value', () => {
    expect(formatInr(-0)).toBe(formatInr(0))
    expect(formatInr(0.015)).toBe('₹0.02')
  })
})
