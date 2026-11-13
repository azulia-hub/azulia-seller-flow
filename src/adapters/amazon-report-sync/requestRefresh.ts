import { hostedDelivery, syncHosted } from '../amazon-hosted/client'
import type { DateRange } from '../../core/analytics/timePeriods'
/** All user refresh entry points use the existing coordinator and retain the current visible date range. */
export async function requestReportRefresh(range: DateRange): Promise<void> {
  if (hostedDelivery) {
    await syncHosted(range, { forceRecent: true, forceHistory: true })
    return
  }
  const response = await fetch('/api/report-sync/refresh', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Azulia-Intent': 'sync-report' },
    body: JSON.stringify(range),
  })
  if (!response.ok) throw new Error('Could not request refreshed history. Saved results remain available.')
}
