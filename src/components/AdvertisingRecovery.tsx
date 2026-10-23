import { createContext, useContext } from 'react'
import type { SponsoredProductsAttribution } from '../core/advertising/sponsoredProducts'

type DateRange = { from: string; to: string }
export const AdvertisingRecoveryContext = createContext<{
  shared: DateRange | null
  financial: DateRange
  onUseDates: () => void
  onOpenReports: () => void
} | null>(null)

export function advertisingDateRange(from: string, to: string) {
  const format = (value: string) => {
    const date = new Date(`${value}T00:00:00Z`)
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)
  }
  return `${format(from)} – ${format(to)}`
}

/** Shows recovery at the point where advertising evidence is unavailable. */
export function AdvertisingRecovery({ report }: { report: SponsoredProductsAttribution }) {
  const recovery = useContext(AdvertisingRecoveryContext)
  const shared = recovery?.shared
  const needsReport = report.status === 'NO_REPORT'
  const noOverlap = !needsReport && !shared
  const unsupported = report.status === 'UNSUPPORTED_FILTER'
  return <div className="seller-empty-inline advertising-recovery">
    <div><strong>{needsReport ? 'Add your advertising report' : noOverlap ? 'These reports have no shared dates' : unsupported ? 'Advertising needs all account and fulfilment types' : `Your advertising report covers ${advertisingDateRange(report.reportFrom ?? '', report.reportTo ?? '')}`}</strong>
      <p>{needsReport ? 'Upload a Sponsored Products Advertised product report to see ACOS, ROAS and other advertising metrics.' : noOverlap ? `Financial report: ${advertisingDateRange(recovery?.financial.from ?? '', recovery?.financial.to ?? '')}. Advertising report: ${advertisingDateRange(report.reportFrom ?? '', report.reportTo ?? '')}. Upload a report covering the same dates.` : `You’re viewing ${advertisingDateRange(report.selectedFrom, report.selectedTo)}. ${unsupported ? 'The ads report has no account or fulfilment breakdown. ' : ''}View the shared dates to see business and advertising results together.`}</p>
      {shared ? <small>Switches to transactions by posting date and includes all account and fulfilment types.</small> : null}
    </div>
    {recovery ? <button className="secondary" onClick={needsReport || noOverlap ? recovery.onOpenReports : recovery.onUseDates}>{needsReport ? 'Add advertising report' : noOverlap ? 'Upload another report' : `View ${advertisingDateRange(shared!.from, shared!.to)}`}</button> : null}
  </div>
}
