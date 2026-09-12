import type { ProductCost } from './types'

export interface CostHistoryPoint {
  readonly effectiveFrom: string | null
  readonly unitCost: number
}

export interface CostHistorySummary {
  readonly sku: string
  readonly points: readonly CostHistoryPoint[]
  readonly currentCost: number
  readonly absoluteChange: number
  readonly changePercent: number | null
}

const round = (value: number) => Math.round(value * 100) / 100

export function summarizeCostHistory(costs: readonly ProductCost[], normalizeSku: (sku: string) => string = value => value): CostHistorySummary[] {
  const grouped = new Map<string, { sku: string; points: CostHistoryPoint[] }>()
  costs.forEach(cost => {
    const key = normalizeSku(cost.sku).trim().toLocaleLowerCase()
    const group = grouped.get(key) ?? { sku: cost.sku, points: [] }
    group.points.push({ effectiveFrom: cost.effectiveFrom ?? null, unitCost: cost.unitCost })
    grouped.set(key, group)
  })
  return [...grouped.values()].map(group => {
    const points = [...group.points].sort((a, b) => (a.effectiveFrom ?? '').localeCompare(b.effectiveFrom ?? ''))
    const first = points[0]?.unitCost ?? 0
    const current = points.at(-1)?.unitCost ?? 0
    return {
      sku: group.sku,
      points,
      currentCost: current,
      absoluteChange: round(current - first),
      changePercent: first ? round((current - first) / first * 100) : null,
    }
  }).sort((a, b) => a.sku.localeCompare(b.sku))
}
