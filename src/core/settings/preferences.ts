import type { TimePeriodPreset } from '../analytics/timePeriods'
export const snapshotPeriods = ['Today (so far)', 'Yesterday', 'This Month', 'Month Forecast'] as const
export type SnapshotPeriod = typeof snapshotPeriods[number]
export interface AppPreferences {
  syncMinutes: 2 | 3 | 4 | 5
  wifiOnly: boolean
  periods: SnapshotPeriod[]
  metrics: ('grossSales' | 'netEarnings' | 'profit')[]
  defaultPeriod: TimePeriodPreset
  includeCustomerTax: boolean
  estimateMissingPrices: boolean
  notifyOrders: boolean
  notifyConfirmations: boolean
  notifyRefunds: boolean
  notificationSound: boolean
  theme: 'system' | 'light' | 'dark'
  compact: boolean
  moneyDecimals: 0 | 2
  numberGrouping: 'indian' | 'international'
}
export const defaultPreferences: AppPreferences = {
  syncMinutes: 3, wifiOnly: false, periods: [...snapshotPeriods], metrics: ['grossSales','netEarnings','profit'],
  defaultPeriod: 'LAST_30_DAYS', includeCustomerTax: true, estimateMissingPrices: false,
  notifyOrders: true, notifyConfirmations: true, notifyRefunds: true, notificationSound: true,
  theme: 'system', compact: false, moneyDecimals: 0, numberGrouping: 'indian',
}
const periods = new Set(['LAST_3_DAYS','LAST_7_DAYS','THIS_WEEK','LAST_WEEK','LAST_30_DAYS','THIS_MONTH','LAST_MONTH','LAST_3_MONTHS','LAST_6_MONTHS','THIS_YEAR','LAST_YEAR'])
export function preferences(value: unknown): AppPreferences {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const result = { ...row, ...defaultPreferences,periods:[...defaultPreferences.periods],metrics:[...defaultPreferences.metrics] } as AppPreferences
  for (const key of ['wifiOnly','includeCustomerTax','estimateMissingPrices','notifyOrders','notifyConfirmations','notifyRefunds','notificationSound','compact'] as const) if (typeof row[key] === 'boolean') result[key] = row[key]
  if ([2,3,4,5].includes(Number(row.syncMinutes))) result.syncMinutes = Number(row.syncMinutes) as AppPreferences['syncMinutes']
  if (typeof row.defaultPeriod === 'string' && periods.has(row.defaultPeriod)) result.defaultPeriod = row.defaultPeriod as TimePeriodPreset
  if (row.theme === 'dark' || row.theme === 'light') result.theme = row.theme
  if (row.moneyDecimals === 2) result.moneyDecimals = 2
  if (row.numberGrouping === 'international') result.numberGrouping = 'international'
  if (Array.isArray(row.periods)) { const values = [...new Set(row.periods)].filter((v): v is SnapshotPeriod => snapshotPeriods.includes(v as SnapshotPeriod)); if (values.length) result.periods = values }
  if (Array.isArray(row.metrics)) { const values = [...new Set(row.metrics)].filter((v): v is AppPreferences['metrics'][number] => ['grossSales','netEarnings','profit'].includes(v)); if (values.length) result.metrics = values }
  return result
}
