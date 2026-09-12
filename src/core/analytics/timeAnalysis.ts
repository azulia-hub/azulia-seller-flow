import type { OrderProfitSummary } from './orderProfit'

export type TimeMetric = 'ORDERS' | 'UNITS' | 'SALES' | 'PROFIT' | 'RETURNS'
export interface TimeBucket { readonly key: string; readonly label: string; readonly current: number; readonly previous: number; readonly change: number; readonly changePercent: number | null }
export interface TimeHeatCell { readonly weekday: number; readonly weekdayLabel: string; readonly hour: number; readonly current: number; readonly previous: number; readonly change: number }
export interface OrderTimeDimensions { readonly timestamp: string; readonly date: string; readonly time: string; readonly weekday: string; readonly hour: number; readonly week: string }
export interface TimeComparisonResult {
  readonly timezone: string
  readonly metric: TimeMetric
  readonly current: { readonly orders: number; readonly activeDays: number; readonly averageOrdersPerActiveDay: number; readonly weekendShare: number; readonly peakDate: string | null; readonly peakWeekday: string | null; readonly peakHour: string | null }
  readonly previous: { readonly orders: number; readonly activeDays: number; readonly averageOrdersPerActiveDay: number; readonly weekendShare: number; readonly peakDate: string | null; readonly peakWeekday: string | null; readonly peakHour: string | null }
  readonly orderChangePercent: number | null
  readonly weekdays: readonly TimeBucket[]
  readonly hours: readonly TimeBucket[]
  readonly weeks: readonly TimeBucket[]
  readonly heatmap: readonly TimeHeatCell[]
  readonly unknownCurrent: number
  readonly unknownPrevious: number
}

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const changePercent = (current: number, previous: number) => previous ? round((current - previous) / Math.abs(previous) * 100) : null

export function parseReportTimestamp(value: string | null): Date | null {
  if (!value) return null
  const iso = new Date(value)
  if (!Number.isNaN(iso.getTime())) return iso
  const match = value.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(am|pm)?\s*(UTC)?$/i)
  if (!match) return null
  const month = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(match[2].slice(0, 3).toLowerCase())
  if (month < 0) return null
  let hour = Number(match[4])
  if (match[7]?.toLowerCase() === 'pm' && hour < 12) hour += 12
  if (match[7]?.toLowerCase() === 'am' && hour === 12) hour = 0
  const timestamp = Date.UTC(Number(match[3]), month, Number(match[1]), hour, Number(match[5]), Number(match[6]))
  const parsed = new Date(timestamp)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function isoWeek(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00Z`)
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return `${date.getUTCFullYear()}-W${String(Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)).padStart(2, '0')}`
}

export function orderTimeDimensions(order: OrderProfitSummary, timezone = 'Asia/Kolkata'): OrderTimeDimensions | null {
  const saleTimestamp = order.events.find(event => event.event === 'SALE' && event.amountType === 'PRODUCT_REVENUE' && event.amount > 0)?.date ?? order.date
  const parsed = parseReportTimestamp(saleTimestamp)
  if (!parsed) return null
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'long' }).formatToParts(parsed)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? ''
  const date = `${part('year')}-${part('month')}-${part('day')}`
  return { timestamp: parsed.toISOString(), date, time: `${part('hour')}:${part('minute')}`, weekday: part('weekday'), hour: Number(part('hour')), week: isoWeek(date) }
}

const metricValue = (order: OrderProfitSummary, metric: TimeMetric) => metric === 'ORDERS' ? 1 : metric === 'UNITS' ? order.soldQuantity : metric === 'SALES' ? order.grossSales : metric === 'PROFIT' ? order.profit + order.advertising : order.returnQuantity

function indexed(orders: readonly OrderProfitSummary[], timezone: string) {
  const values = orders.filter(order => order.soldQuantity > 0).map(order => ({ order, time: orderTimeDimensions(order, timezone) }))
  return { known: values.filter((item): item is { order: OrderProfitSummary; time: OrderTimeDimensions } => Boolean(item.time)), unknown: values.filter(item => !item.time).length }
}

function overview(items: ReturnType<typeof indexed>['known']) {
  const dateCounts = new Map<string, number>(), weekdayCounts = new Map<string, number>(), hourCounts = new Map<number, number>()
  items.forEach(({ time }) => { dateCounts.set(time.date, (dateCounts.get(time.date) ?? 0) + 1); weekdayCounts.set(time.weekday, (weekdayCounts.get(time.weekday) ?? 0) + 1); hourCounts.set(time.hour, (hourCounts.get(time.hour) ?? 0) + 1) })
  const peak = <T,>(map: Map<T, number>) => [...map].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const weekendOrders = items.filter(({ time }) => time.weekday === 'Saturday' || time.weekday === 'Sunday').length
  const peakHour = peak(hourCounts)
  return { orders: items.length, activeDays: dateCounts.size, averageOrdersPerActiveDay: dateCounts.size ? round(items.length / dateCounts.size) : 0, weekendShare: items.length ? round(weekendOrders / items.length * 100) : 0, peakDate: peak(dateCounts), peakWeekday: peak(weekdayCounts), peakHour: peakHour === null ? null : `${String(peakHour).padStart(2, '0')}:00–${String((peakHour + 1) % 24).padStart(2, '0')}:00` }
}

export function buildOrderTimeComparison(currentOrders: readonly OrderProfitSummary[], previousOrders: readonly OrderProfitSummary[], metric: TimeMetric, timezone = 'Asia/Kolkata'): TimeComparisonResult {
  const current = indexed(currentOrders, timezone), previous = indexed(previousOrders, timezone)
  const bucket = (keys: readonly (string | number)[], label: (key: string | number) => string, pick: (time: OrderTimeDimensions) => string | number): TimeBucket[] => keys.map(key => {
    const total = (items: typeof current.known) => round(items.filter(item => pick(item.time) === key).reduce((sum, item) => sum + metricValue(item.order, metric), 0))
    const currentValue = total(current.known), previousValue = total(previous.known)
    return { key: String(key), label: label(key), current: currentValue, previous: previousValue, change: round(currentValue - previousValue), changePercent: changePercent(currentValue, previousValue) }
  })
  const weekdayBuckets = bucket(weekdays, key => String(key).slice(0, 3), time => time.weekday)
  const hourBuckets = bucket(Array.from({ length: 24 }, (_, index) => index), key => `${String(key).padStart(2, '0')}:00`, time => time.hour)
  const weeklyTotals = (items: typeof current.known) => {
    const totals = new Map<string, number>()
    items.forEach(item => totals.set(item.time.week, round((totals.get(item.time.week) ?? 0) + metricValue(item.order, metric))))
    return [...totals].sort(([left], [right]) => left.localeCompare(right))
  }
  const currentWeeks = weeklyTotals(current.known), previousWeeks = weeklyTotals(previous.known)
  const weekBuckets: TimeBucket[] = Array.from({ length: Math.max(currentWeeks.length, previousWeeks.length) }, (_, index) => {
    const currentValue = currentWeeks[index]?.[1] ?? 0, previousValue = previousWeeks[index]?.[1] ?? 0
    return { key: String(index + 1), label: `Week ${index + 1}`, current: currentValue, previous: previousValue, change: round(currentValue - previousValue), changePercent: changePercent(currentValue, previousValue) }
  })
  const heatmap = weekdays.flatMap((weekday, weekdayIndex) => Array.from({ length: 24 }, (_, hour) => {
    const total = (items: typeof current.known) => round(items.filter(item => item.time.weekday === weekday && item.time.hour === hour).reduce((sum, item) => sum + metricValue(item.order, metric), 0))
    const currentValue = total(current.known), previousValue = total(previous.known)
    return { weekday: weekdayIndex, weekdayLabel: weekday, hour, current: currentValue, previous: previousValue, change: round(currentValue - previousValue) }
  }))
  const currentOverview = overview(current.known), previousOverview = overview(previous.known)
  return { timezone, metric, current: currentOverview, previous: previousOverview, orderChangePercent: changePercent(currentOverview.orders, previousOverview.orders), weekdays: weekdayBuckets, hours: hourBuckets, weeks: weekBuckets, heatmap, unknownCurrent: current.unknown, unknownPrevious: previous.unknown }
}
