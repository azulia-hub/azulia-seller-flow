export type TimePeriodPreset = 'LAST_3_DAYS' | 'LAST_7_DAYS' | 'THIS_WEEK' | 'LAST_WEEK' | 'LAST_30_DAYS' | 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_3_MONTHS' | 'LAST_6_MONTHS' | 'THIS_YEAR' | 'LAST_YEAR'
export interface DateRange { readonly from: string; readonly to: string }
export const TIME_PERIOD_OPTIONS: readonly { id: TimePeriodPreset; label: string }[] = [
  { id: 'LAST_3_DAYS', label: 'Last 3 days' }, { id: 'LAST_7_DAYS', label: 'Last 7 days' }, { id: 'THIS_WEEK', label: 'This week' }, { id: 'LAST_WEEK', label: 'Last week' }, { id: 'LAST_30_DAYS', label: 'Last 30 days' }, { id: 'THIS_MONTH', label: 'This month' }, { id: 'LAST_MONTH', label: 'Last month' }, { id: 'LAST_3_MONTHS', label: 'Last 3 months' }, { id: 'LAST_6_MONTHS', label: 'Last 6 months' }, { id: 'THIS_YEAR', label: 'This year' }, { id: 'LAST_YEAR', label: 'Last year' },
]
const parse = (value: string) => new Date(`${value}T00:00:00Z`)
const key = (date: Date) => date.toISOString().slice(0, 10)
const addDays = (date: Date, days: number) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days))
const monthStart = (date: Date, offset = 0) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1))
const monthEnd = (date: Date, offset = 0) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset + 1, 0))
const range = (from: Date, to: Date): DateRange => ({ from: key(from), to: key(to) })

export function recommendTimePeriod(minDate: string, maxDate: string): TimePeriodPreset {
  const days = Math.floor((parse(maxDate).getTime() - parse(minDate).getTime()) / 86400000) + 1
  return days <= 3 ? 'LAST_3_DAYS' : days <= 10 ? 'LAST_7_DAYS' : days <= 45 ? 'LAST_30_DAYS' : days <= 120 ? 'LAST_3_MONTHS' : days <= 240 ? 'LAST_6_MONTHS' : 'THIS_YEAR'
}

export function resolveTimePeriod(id: TimePeriodPreset, anchorDate: string) {
  const anchor = parse(anchorDate)
  let current: DateRange, previous: DateRange
  if (id === 'THIS_WEEK' || id === 'LAST_WEEK') {
    const monday = addDays(anchor, -((anchor.getUTCDay() + 6) % 7)), start = id === 'THIS_WEEK' ? monday : addDays(monday, -7), end = id === 'THIS_WEEK' ? anchor : addDays(monday, -1)
    const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
    current = range(start, end); previous = range(addDays(start, -days), addDays(start, -1))
  } else if (id === 'THIS_MONTH' || id === 'LAST_MONTH') {
    if (id === 'THIS_MONTH') { const prior = monthStart(anchor, -1); current = range(monthStart(anchor), anchor); previous = range(prior, new Date(Date.UTC(prior.getUTCFullYear(), prior.getUTCMonth(), Math.min(anchor.getUTCDate(), monthEnd(anchor, -1).getUTCDate())))) }
    else { current = range(monthStart(anchor, -1), monthEnd(anchor, -1)); previous = range(monthStart(anchor, -2), monthEnd(anchor, -2)) }
  } else if (id === 'THIS_YEAR' || id === 'LAST_YEAR') {
    if (id === 'THIS_YEAR') { const priorMonth = new Date(Date.UTC(anchor.getUTCFullYear() - 1, anchor.getUTCMonth(), 1)); current = range(new Date(Date.UTC(anchor.getUTCFullYear(), 0, 1)), anchor); previous = range(new Date(Date.UTC(anchor.getUTCFullYear() - 1, 0, 1)), new Date(Date.UTC(anchor.getUTCFullYear() - 1, anchor.getUTCMonth(), Math.min(anchor.getUTCDate(), monthEnd(priorMonth).getUTCDate())))) }
    else { current = range(new Date(Date.UTC(anchor.getUTCFullYear() - 1, 0, 1)), new Date(Date.UTC(anchor.getUTCFullYear() - 1, 11, 31))); previous = range(new Date(Date.UTC(anchor.getUTCFullYear() - 2, 0, 1)), new Date(Date.UTC(anchor.getUTCFullYear() - 2, 11, 31))) }
  } else {
    const days = id === 'LAST_3_DAYS' ? 3 : id === 'LAST_7_DAYS' ? 7 : id === 'LAST_30_DAYS' ? 30 : id === 'LAST_3_MONTHS' ? 90 : 180
    current = range(addDays(anchor, 1 - days), anchor); previous = range(addDays(anchor, 1 - days * 2), addDays(anchor, -days))
  }
  return { id, label: TIME_PERIOD_OPTIONS.find(option => option.id === id)!.label, current, previous }
}
export const dateInRange = (date: string | null, value: DateRange) => Boolean(date && date >= value.from && date <= value.to)
export const rangeCoverage = (value: DateRange, minDate: string, maxDate: string) => value.to < minDate || value.from > maxDate ? 'No data coverage' : value.from >= minDate && value.to <= maxDate ? 'Full coverage' : 'Partial coverage'
export function previousEqualRange(current: DateRange): DateRange {
  const from = parse(current.from), to = parse(current.to)
  const days = Math.floor((to.getTime() - from.getTime()) / 86400000) + 1
  return range(addDays(from, -days), addDays(from, -1))
}
