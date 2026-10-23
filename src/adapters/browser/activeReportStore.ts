import { TIME_PERIOD_OPTIONS, type TimePeriodPreset } from '../../core/analytics/timePeriods'
const key = 'azulia.active-report'
export function loadActiveReportId(): string | null { try { return localStorage.getItem(key) } catch { return null } }
export function saveActiveReportId(id: string) { try { localStorage.setItem(key, id) } catch { /* Saved imports remain available in Reports. */ } }

export interface SavedAnalysisView { from: string; to: string; period: TimePeriodPreset | 'ALL' | 'CUSTOM'; basis: 'SALE_PERIOD_ORDERS' | 'POSTED_ACTIVITY'; fulfillment: string }
export function loadAnalysisView(id: string): SavedAnalysisView | null {
  try {
    const value = JSON.parse(localStorage.getItem(`azulia.analysis-view.${id}`) ?? 'null')
    if (!value || typeof value.from !== 'string' || typeof value.to !== 'string' || value.from > value.to || !/^\d{4}-\d{2}-\d{2}$/.test(value.from) || !/^\d{4}-\d{2}-\d{2}$/.test(value.to)) return null
    if (value.basis === 'COMPLETED_ORDERS') value.basis = 'SALE_PERIOD_ORDERS'
    if (!['ALL','CUSTOM',...TIME_PERIOD_OPTIONS.map(option => option.id)].includes(value.period) || !['SALE_PERIOD_ORDERS','POSTED_ACTIVITY'].includes(value.basis) || typeof value.fulfillment !== 'string') return null
    return value
  } catch { return null }
}
export function saveAnalysisView(id: string, view: SavedAnalysisView) { try { localStorage.setItem(`azulia.analysis-view.${id}`, JSON.stringify(view)) } catch { /* View restoration is optional; financial report persistence is separate. */ } }
