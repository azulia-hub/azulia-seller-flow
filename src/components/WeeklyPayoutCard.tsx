import { useEffect, useMemo, useState } from 'react'
import { hostedDelivery, hostedFetch } from '../adapters/amazon-hosted/client'
import { amazonPayoutChannels, payoutChannels } from '../adapters/amazon-api/payouts'
import { weeklyPayout, type PayoutSnapshot } from '../core/cashflow/weeklyPayout'
import { formatInr } from '../adapters/formatting/currency'
import { getIndiaToday } from '../core/sync/planner'

const dateLabel = (value: string) => new Intl.DateTimeFormat('en-IN', {
  weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata',
}).format(new Date(value))

export function WeeklyPayoutCard({ account, records }: {
  readonly account: string
  readonly records?: readonly Record<string, unknown>[]
}) {
  const [snapshot, setSnapshot] = useState<PayoutSnapshot | null>(null)
  const [error, setError] = useState('')
  const channels = useMemo(() => amazonPayoutChannels(records ?? []), [records])

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

  const result = snapshot && weeklyPayout(snapshot.groups, channels, payoutChannels, getIndiaToday(), 7)
  return <section className="panel weekly-payout" aria-labelledby="weekly-payout-title">
    <h2 id="weekly-payout-title">This week’s payout</h2>
    {error ? <p role="status">{error}{snapshot ? ' Showing the last available reading.' : ''}</p> : null}
    {!result && !error ? <p role="status">Loading Amazon payouts…</p> : null}
    {result ? <>
      <dl className="weekly-payout-grid">
        {result.rows.map(({ channel, entries }) => <div key={channel}>
          <dt>{channel}</dt>
          {entries.length ? entries.map(entry => <dd key={entry.id}>
            <strong>{entry.amountMinor === null ? 'Unavailable' : formatInr(entry.amountMinor / 100)}</strong>
            <small>{dateLabel(entry.date)} · {entry.open ? 'Open balance' : entry.transferSucceeded ? 'Transfer sent' : entry.expectedMinor === 0 ? 'No payout' : 'Transfer unconfirmed'}</small>
          </dd>) : <dd><strong>—</strong><small>Payout unavailable</small></dd>}
        </div>)}
        <div>
          <dt>{result.provisional ? 'Total expected deposit' : 'Total deposit'}</dt>
          <dd><strong>{result.totalMinor === null ? '—' : formatInr(result.totalMinor / 100)}</strong>
            <small>{result.totalMinor === null ? 'Awaiting complete payout data' : result.provisional ? 'Estimate until Amazon closes the cycles' : 'Based on Amazon transfer status'}</small>
          </dd>
        </div>
      </dl>
      {result.unclassifiedCount ? <p>Some payout records are awaiting an Electronic or COD match.</p> : null}
      <p>Synced {new Date(snapshot.observedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>
    </> : null}
  </section>
}
