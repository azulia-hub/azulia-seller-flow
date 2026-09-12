import type { MetricDefinition } from './types'
import type { Row } from '../csv/parseCsv'

const n = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function matches(row: Row, filter: Extract<MetricDefinition, { kind: 'aggregate' }>['filter']) {
  if (!filter) return true
  const value = row[filter.field] ?? ''
  if (filter.operator === '=') return value === filter.value
  return value.toLowerCase().includes(filter.value.toLowerCase())
}

export function calculateMetric(def: MetricDefinition, rows: Row[], resolved: Record<string, number>) {
  if (def.kind === 'aggregate') {
    const filtered = rows.filter((row) => matches(row, def.filter))
    if (def.aggregation === 'count') return filtered.length
    const values = filtered.map((row) => n(row[def.field]))
    if (def.aggregation === 'sum') return values.reduce((a, b) => a + b, 0)
    if (def.aggregation === 'sumAbs') return values.reduce((a, b) => a + Math.abs(b), 0)
    if (def.aggregation === 'avg') return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
    throw new Error('Unsupported aggregate operation')
  }

  const left = resolved[def.left] ?? 0
  const right = resolved[def.right] ?? 0
  let result = 0
  if (def.operator === '+') result = left + right
  if (def.operator === '-') result = left - right
  if (def.operator === '*') result = left * right
  if (def.operator === '/') result = right === 0 ? 0 : left / right
  return result * (def.multiplier ?? 1)
}
