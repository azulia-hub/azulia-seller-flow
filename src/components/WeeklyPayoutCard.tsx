import { payoutReconciliation } from '../core/cashflow/payoutReconciliation'
import type { CanonicalFinancialEvent } from '../core/data/types'
import { loadPayoutCredit, PayoutDetails } from './PayoutDetails'
import { useEffect, useMemo, useState } from 'react'
import { hostedDelivery, hostedFetch } from '../adapters/amazon-hosted/client'
import { amazonPayoutChannels, amazonSettlementActivity, payoutChannels } from '../adapters/amazon-api/payouts'
import { shiftPayoutWeek, weeklyPayout, type PayoutGroup, type PayoutSnapshot } from '../core/cashflow/weeklyPayout'
import { formatInr } from '../adapters/formatting/currency'
import { getIndiaToday } from '../core/sync/planner'

const dateLabel = (value: string) => new Intl.DateTimeFormat('en-IN', {
  weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata',
}).format(new Date(value))

export function WeeklyPayoutCard({ account, records, events }: {
  readonly account: string
  readonly events?: readonly CanonicalFinancialEvent[]
  readonly records?: readonly Record<string, unknown>[]
}) {
  const [snapshot, setSnapshot] = useState<PayoutSnapshot | null>(null)
  const [error, setError] = useState('')
  const [week, setWeek] = useState(0)
  const [selectedId, setSelectedId] = useState('')
  const [, refreshCredits] = useState(0)
  const channels = useMemo(() => amazonPayoutChannels(records ?? []), [records])

  const activity = useMemo(() => selectedId ? amazonSettlementActivity(records ?? [], selectedId, events) : [], [records, selectedId, events])

  useEffect(() => {
    const controller = new AbortController()
    let loading = false
    async function refresh() {
      if (loading || document.visibilityState === 'hidden') return
      loading = true
      try {
        const request = hostedDelivery ? hostedFetch : fetch
        const response = await request(`/api/report-sync/payouts?account=${encodeURIComponent(account)}`, {
          cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
        })
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error()
        const result = await response.json() as PayoutSnapshot
        if (!Array.isArray(result.groups) || !Number.isFinite(Date.parse(result.observedAt))) throw new Error()
        if (!controller.signal.aborted) { setSnapshot(result); setError('') }
      } catch {
        if (!controller.signal.aborted) setError('Amazon payout data could not be refreshed.')
      } finally { loading = false }
    }
    void refresh()
    const timer = setInterval(refresh, 5 * 60000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      controller.abort()
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [account])

  const result = snapshot && weeklyPayout(snapshot.groups, channels, payoutChannels, shiftPayoutWeek(getIndiaToday(), week), 7)
  const selected = result && [...result.rows.flatMap(row => row.entries), ...result.unclassified].find(entry => entry.id === selectedId)
  function selectWeek(offset: number) {
    setWeek(week + offset)
    setSelectedId('')
  }
  function bankLabel(group: PayoutGroup) {
    const status = payoutReconciliation(group, [], loadPayoutCredit(account, group.id)).bankStatus
    if (status === 'UNAVAILABLE') return null
    return <small>{status === 'MATCHED' ? 'Bank credit matched' : status === 'AWAITING' ? 'Awaiting bank match' : 'Bank credit needs review'}</small>
  }
  function detailButton(id: string) {
    return <button type="button" className="text-btn" aria-expanded={id === selectedId}
      onClick={() => setSelectedId(id === selectedId ? '' : id)}>{id === selectedId ? 'Hide payout details' : 'View payout details'}</button>
  }
  return <section className="panel weekly-payout" aria-labelledby="weekly-payout-title">
    <h2 id="weekly-payout-title">{week === 0 ? 'This week’s payout' : 'Payout history'}</h2>
    {result ? <div className="seller-feature-fields">
      <button type="button" className="secondary" disabled={week <= -4} onClick={() => selectWeek(-1)}>Previous week</button>
      <span>{result.from} – {result.to}</span>
      <button type="button" className="secondary" disabled={week >= 0} onClick={() => selectWeek(1)}>Next week</button>
    </div> : null}
    {error ? <p role="status">{error}{snapshot ? ' Showing the last available reading.' : ''}</p> : null}
    {!result && !error ? <p role="status">Loading Amazon payouts…</p> : null}
    {result ? <>
      <dl className="weekly-payout-grid">
        {result.rows.map(({ channel, entries }) => <div key={channel}>
          <dt>{channel}</dt>
          {entries.length ? entries.map(entry => <dd key={entry.id}>
            <strong>{entry.displayMinor === null ? 'Unavailable' : formatInr(entry.displayMinor / 100)}</strong>
            <small>{dateLabel(entry.date)} · {entry.open ? 'Open balance' : entry.transferSucceeded ? 'Transfer sent' : entry.expectedMinor === 0 ? 'No payout' : 'Transfer unconfirmed'}</small>
            {bankLabel(entry)}
            {detailButton(entry.id)}
          </dd>) : <dd><strong>—</strong><small>Payout unavailable</small></dd>}
        </div>)}
        <div>
          <dt>{result.provisional ? 'Total expected deposit' : 'Total deposit'}</dt>
          <dd><strong>{result.totalMinor === null ? '—' : formatInr(result.totalMinor / 100)}</strong>
            <small>{result.totalMinor === null ? 'Awaiting complete payout data' : result.provisional ? 'Estimate until Amazon closes the cycles' : 'Based on Amazon transfer status'}</small>
          </dd>
        </div>
      </dl>
      {result.unclassifiedCount ? <div>
        <p>Some payout records are awaiting an Electronic or COD match.</p>
        {result.unclassified.map(entry => <div key={entry.id}><strong>{dateLabel(entry.date)} · {entry.open ? 'Open balance' : entry.transferSucceeded ? 'Transfer sent' : 'Transfer unconfirmed'}</strong>
          {bankLabel(entry)}{detailButton(entry.id)}</div>)}
      </div> : null}
      {selected ? <PayoutDetails key={selected.id} group={selected} account={account} activity={activity} onCreditChange={() => refreshCredits(version => version + 1)} /> : null}
      {week < 0 ? <small>History is limited to settlement cycles returned in the current Amazon reading.</small> : null}
      <p>Synced {new Date(snapshot.observedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>
    </> : null}
  </section>
}
