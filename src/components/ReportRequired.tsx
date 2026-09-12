import type { ReactNode } from 'react'
import { PageHeader } from './PageHeader'

export function ReportRequired({ area, children, onOpenReports }: { readonly area: string; readonly children: ReactNode; readonly onOpenReports: () => void }) {
  return <><PageHeader eyebrow={area} title={`Upload a report to view ${area.toLowerCase()}`} description="This page will automatically fill with clear summaries, charts, and detailed tables after a report is loaded." /><section className="welcome-empty compact"><div className="welcome-illustration">⇧</div><h2>No report is currently open</h2><p>{children}</p><button className="primary" onClick={onOpenReports}>Go to Reports</button><small>CSV and TSV reports are supported.</small></section></>
}
