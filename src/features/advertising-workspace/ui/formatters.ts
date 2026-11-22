import type { AdvertisingChange } from '../contract'

const integerFormatter = new Intl.NumberFormat('en-IN')

export function formatMetricValue(
  value: number | null,
  format: 'MONEY' | 'PERCENT' | 'MULTIPLIER',
  formatMoney: (n: number) => string
): string {
  if (value === null || !Number.isFinite(value)) return '—'
  if (format === 'MONEY') return formatMoney(value)
  if (format === 'PERCENT') return `${value.toFixed(1)}%`
  if (format === 'MULTIPLIER') return `${value.toFixed(2)}×`
  return String(value)
}

export function formatChange(change: AdvertisingChange | null): string {
  if (!change || !Number.isFinite(change.value)) return ''
  const sign = change.value > 0 ? '+' : ''
  if (change.unit === 'PERCENT') return `${sign}${change.value.toFixed(1)}%`
  if (change.unit === 'PERCENTAGE_POINTS') return `${sign}${change.value.toFixed(1)} pp`
  return `${sign}${change.value.toFixed(0)}`
}

export function formatInteger(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return integerFormatter.format(Math.round(value))
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(1)}%`
}

export function formatMultiplier(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(2)}×`
}
