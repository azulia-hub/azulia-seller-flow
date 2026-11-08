import type { useAutomaticReport } from '../app/useAutomaticReport'
import './automaticReport.css'
const dateLabel = (value: string) => new Date(value).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
export function AutomaticReportStatus({ delivery, enabled, issues, onAutomatic, onManual, orderCycle = true }: { delivery: ReturnType<typeof useAutomaticReport>; enabled: boolean; issues: readonly string[]; onAutomatic: () => void; onManual: () => void; orderCycle?: boolean }) {
  const { status, calculating, phase, lastReading, error, appliedRevision, updatesPending } = delivery
  const failure = error || status?.error || status?.orderDatesError
  const ready = appliedRevision !== null
  const incomplete = Boolean(status?.missingWindows || orderCycle && (status?.pendingOrderDates || status?.purchaseHistoryPending || status?.pendingOrderCycles))
  const backgroundBusy = status?.state === 'syncing' || status?.orderDatesSyncing
  const title = !enabled ? 'Manual report fallback' : calculating ? phase === 'fetching' ? 'Reading new cached activity…' : phase === 'saving' ? 'Saving updated reading…' : 'Calculating new reading…' : ready ? 'Results ready' : failure ? 'Could not prepare the first reading' : !status ? 'Opening saved data…' : !status.configured ? status.onDemand ? 'Connect Amazon to sync' : 'Configure the local Amazon connection' : status.onDemand ? 'Ready for an on-demand sync' : 'Preparing the first saved reading…'
  const busy = enabled && (calculating || backgroundBusy || (!ready && !failure && status?.configured !== false && !status?.onDemand))
  const needsAttention = Boolean(failure || status?.orderDateIssues || status?.catalogError)
  const indicatorLabel = !enabled ? 'Manual report mode' : busy ? title === 'Results ready' ? 'Syncing with Amazon' : title : needsAttention ? 'Sync needs attention' : title
  return <details className="sync-indicator">
    <summary aria-label={indicatorLabel} title={indicatorLabel}><span className={busy ? 'automatic-report-spinner' : needsAttention ? 'automatic-report-warning' : 'automatic-report-dot'} aria-hidden="true" /><span className="sync-indicator-label">{!enabled ? 'Manual' : busy ? 'Updating' : needsAttention ? 'Review' : 'Synced'}</span></summary>
    <section className="automatic-report-status sync-indicator-popover" aria-label="Calculation and sync status">
    <div role="status" aria-live="polite"><span className={calculating ? 'automatic-report-spinner' : failure && !ready ? 'automatic-report-warning' : 'automatic-report-dot'} aria-hidden="true" /><strong>{title}</strong>
      <small>{ready ? 'Using last completed reading' : 'No completed reading yet'}{lastReading ? ` · Calculated ${new Date(lastReading).toLocaleString('en-IN')}` : ''}</small>
      {calculating && ready ? <small>Your saved reading is retained while the dashboard updates.</small> : null}
    </div>
    <div>{enabled ? <button className="secondary" onClick={onManual}>Upload fallback report</button> : <button className="secondary" onClick={onAutomatic}>{status?.onDemand ? 'Use Amazon data' : 'Use automatic activity'}</button>}</div>
    {enabled && status?.configured ? <p className="automatic-report-background"><span className={backgroundBusy ? 'automatic-report-spinner' : 'automatic-report-dot'} aria-hidden="true" />{status.onDemand ? 'On-demand sync: ' : 'Background sync: '}{failure ? 'paused — saved results are safe' : updatesPending ? 'new cached activity is queued' : incomplete ? 'loading missing history and purchase dates' : backgroundBusy ? 'checking Amazon' : status.onDemand ? 'idle — press Sync now to fetch updates' : 'up to date with downloaded data'}{updatesPending ? ' · New data queued for the next update (batched about every 15 seconds).' : ''}{status.pendingOrderDates ? ` · ${status.pendingOrderDates} order dates remaining` : ''}{status.pendingOrderCycles ? ` · ${status.pendingOrderCycles} order-history updates remaining` : ''}</p> : null}
    {failure ? <p role="alert">{failure}{ready ? ' The last completed result remains visible.' : ''} <a href={status?.onDemand ? "#amazon-connection" : "/auth/local"}>Connection settings</a></p> : null}
    {enabled && incomplete ? <p>Calculations use the currently downloaded records. Historical totals remain incomplete until the missing dates and history finish loading.</p> : null}
    {enabled && status?.orderDateIssues ? <p role="alert">{status.orderDateIssues} unsupported order references need review. Other orders continue syncing.</p> : null}
    <details><summary>What is syncing?{issues.length ? ` · ${issues.length} source notes` : ''}</summary>
      <p>{status?.onDemand ? 'The browser requests Amazon pages only during a sync you start. Source records and pagination checkpoints stay in this device’s storage; the Netlify relay does not save them. Closing this page stops further requests.' : 'The app reads new and changed Amazon transactions into the local cache, verifies missing purchase dates, and checks linked order history. It does not download the full report on every visit. Initial checks already covered by saved financial history are reused.'}</p>
      {status?.catalogPending ? <p>{status.catalogPending} product images queued.</p> : null}
      {status?.catalogError ? <p role="alert">{status.catalogError}</p> : null}
      <p>Orders are selected by verified purchase date. All recorded fees, refunds and reimbursements update that original period, including deferred entries; release timing does not gate the totals. {status?.onDemand ? 'This hosted mode syncs only while the page is open and a requested sync is running.' : 'The backend continues while it is running with the browser closed.'}</p>
      <p>{status?.records ?? 0} saved source records. Displayed revision: {appliedRevision ?? 'none'}; source revision: {status?.revision ?? 'unknown'}. <a href={status?.onDemand ? "#amazon-connection" : "/auth/local"}>Connection settings</a>. A completed calculation does not mean Amazon has supplied every future financial update.</p>
      {status?.coverage?.map(range => <small key={`${range.from}:${range.to}`}>Financial history: {dateLabel(range.from)} – {dateLabel(range.to)} (India)<br /></small>)}
      {issues.length ? <details className="automatic-report-notes"><summary>Source notes ({issues.length})</summary><div><ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div><p>Unclassified money remains in Reports → Data quality.</p></details> : null}
    </details>
    </section>
  </details>
}
