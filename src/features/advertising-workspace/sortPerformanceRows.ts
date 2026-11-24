import type { AdvertisingEntityRow, AdvertisingSortQuery } from './contract'

const metricBySort = {
  SPEND: 'spend',
  SALES: 'attributedSales',
  ACOS: 'acos',
  ROAS: 'roas',
  PURCHASES: 'purchases',
} as const

export function sortPerformanceRows(rows: readonly AdvertisingEntityRow[], { sort, direction }: AdvertisingSortQuery) {
  const field = metricBySort[sort]
  return [...rows].sort((a, b) => {
    const left = a.metrics[field], right = b.metrics[field]
    if (left === null) return right === null ? a.name.localeCompare(b.name) : 1
    if (right === null) return -1
    return (direction === 'ASC' ? left - right : right - left) || a.name.localeCompare(b.name)
  })
}
