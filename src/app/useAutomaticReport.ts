import { hostedDelivery, hostedFetch } from '../adapters/amazon-hosted/client'
import { sharedDelivery, sharedRequest } from '../adapters/amazon-shared/client'
import { useEffect, useRef, useState } from 'react'
import { mergeSnapshot } from '../adapters/amazon-report-sync/mergeSnapshot'
import type { SourceOrderSummary, SyncSnapshot, SyncStatus } from '../adapters/amazon-report-sync/protocol'
import { advanceReading, deliveryVersion, loadReading, saveReading, type AutomaticReading } from '../adapters/amazon-report-sync/readingStore'
import type { toUnifiedReport } from '../adapters/amazon-report-sync/toUnifiedReport'
const deliveryFetch = (input: string, init?: RequestInit) => hostedDelivery ? hostedFetch(input, init) : fetch(input, init)
export function useAutomaticReport(options: { enabled: boolean; visibleConnectionKey?: string; range: { from: string; to: string } | null; onReading: (reading: AutomaticReading) => void; onIdentityChange: () => void }) {
  const latest = useRef(options); latest.current = options
  const [phase, setPhase] = useState<'idle' | 'fetching' | 'calculating' | 'saving'>('idle')
  const [appliedRevision, setAppliedRevision] = useState<number | null>(null)
  const [status, setStatus] = useState<SyncStatus | null>(null), [error, setError] = useState(''), [lastReading, setLastReading] = useState<string | null>(null)
  useEffect(() => {
    const abort = new AbortController(); let active = true, working = false, nextPoll = 0, nextCalculation = 0, mappingOutdated = false, worker: Worker | undefined, key: string | null = null, applied = -1, sourceRecords: Record<string, unknown>[] | null = null, sourceOrders: SourceOrderSummary[] | null = null, currentReading: AutomaticReading | null = null
    async function poll() {
      if (!active || working || Date.now() < nextPoll) return
      working = true
      try {
        const response = await deliveryFetch('/api/report-sync/status', { cache: 'no-store', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]) })
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Start npm run local to enable automatic delivery. Manual uploads remain available.')
        const info = await response.json() as SyncStatus
        if (!active) return
        setStatus(info); setError('')
        if (!info.configured || !latest.current.enabled) return
        if (key !== info.connectionKey) {
          if (key !== null || latest.current.visibleConnectionKey && latest.current.visibleConnectionKey !== info.connectionKey) latest.current.onIdentityChange()
          key = info.connectionKey; setAppliedRevision(null); applied = -1; sourceRecords = null; sourceOrders = null; currentReading = null; mappingOutdated = false
          const saved = await loadReading(key)
          if (!active) return
          if (saved) { mappingOutdated = saved.deliveryVersion !== deliveryVersion || sharedDelivery && saved.serverEngine !== info.engine; if (!mappingOutdated) { latest.current.onReading(saved); setAppliedRevision(saved.revision); setLastReading(saved.importedAt) } applied = saved.revision; sourceRecords = saved.sourceRecords ?? null; sourceOrders = saved.sourceOrders ?? null; currentReading = saved }
        }
        if (applied > info.revision) { applied = -1; sourceRecords = null; sourceOrders = null }
        if (sharedDelivery && currentReading && currentReading.serverEngine !== info.engine) mappingOutdated=true
        if ((!mappingOutdated && applied === info.revision) || info.revision === 0) return
        const isSyncing = info.state === 'syncing'
        if (!mappingOutdated && applied >= 0 && isSyncing && Date.now() < nextCalculation) return
        setPhase('fetching')
        let snapshot: SyncSnapshot
        let serverResult: (ReturnType<typeof toUnifiedReport> & {calculatedAt?:string}) | undefined
        {
          // A mapping migration needs the complete local snapshot, including Orders-only metadata.
          // This reads the local cache; it does not redownload Amazon history.
          const after = !mappingOutdated && sourceRecords ? applied : -1
          if (sharedDelivery) {
            const bundle = await sharedRequest<{snapshot:SyncSnapshot;normalized:ReturnType<typeof toUnifiedReport> & {calculatedAt?:string};engine:string}>('reading',{},abort.signal)
            snapshot=bundle.snapshot;serverResult=bundle.normalized
          } else {
          const data = await deliveryFetch(`/api/report-sync/data?after=${after}`, { cache: 'no-store', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]) })
          if (data.status === 204) return
          if (!data.ok) throw new Error('Could not read the new activity. The last reading stays visible.')
          snapshot = await data.json() as SyncSnapshot
          }
        }
        if (snapshot.connectionKey !== key) throw new Error('The account changed during delivery. Reopen the local connection.')
        const merged = mergeSnapshot(snapshot, sourceRecords, sourceOrders)
        const completeSnapshot = merged.snapshot
        if (!sharedDelivery && !mappingOutdated && currentReading && !merged.changed) {
          // Coverage/revision-only updates must not run the worker or replace React's dataset.
          setPhase('saving')
          try { currentReading = await advanceReading(currentReading, snapshot.revision, completeSnapshot.orders) }
          catch { throw new Error('The unchanged source revision could not be saved. Your previous reading remains available; check browser storage.') }
          if (!active || !latest.current.enabled) return
          applied = snapshot.revision; sourceRecords = completeSnapshot.records; sourceOrders = completeSnapshot.orders
          setAppliedRevision(applied)
          latest.current.onReading(currentReading)
          return
        }
        setPhase('calculating')
        const result = serverResult ?? await new Promise<ReturnType<typeof toUnifiedReport>>((resolve, reject) => {
          worker = new Worker(new URL('../workers/reportDelivery.worker.ts', import.meta.url), { type: 'module' })
          const timeout = setTimeout(() => { abort.signal.removeEventListener('abort', stopped); reject(new Error('Calculation took longer than 60 seconds. The last saved reading is retained; the update will retry.')) }, 60000)
          const stopped = () => { clearTimeout(timeout); reject(new Error('Delivery stopped.')) }
          worker.onmessage = (event: MessageEvent<ReturnType<typeof toUnifiedReport> & { error?: string; connectionKey: string; revision: number }>) => {
            clearTimeout(timeout); abort.signal.removeEventListener('abort', stopped)
            if (event.data.error) reject(new Error(event.data.error))
            else if (event.data.connectionKey !== key || event.data.revision !== snapshot.revision) reject(new Error('The reading does not match the requested source revision.'))
            else resolve(event.data)
          }
          worker.onerror = () => { clearTimeout(timeout); abort.signal.removeEventListener('abort', stopped); reject(new Error('Automatic report calculation failed. The last saved reading remains available.')) }
          abort.signal.addEventListener('abort', stopped, { once: true })
          try { worker.postMessage(completeSnapshot) } catch (cause) { clearTimeout(timeout); abort.signal.removeEventListener('abort', stopped); reject(cause) }
        })
        if (!active || !latest.current.enabled) return
        setPhase('saving')
        let reading: AutomaticReading
        try { reading = await saveReading(key!, snapshot.revision, result, completeSnapshot.records, completeSnapshot.orders, sharedDelivery ? info.engine : undefined) } catch { throw new Error('New activity was read, but this browser could not save its calculation. The last saved reading remains visible; check browser storage.') }
        if (!active || !latest.current.enabled) return
        latest.current.onReading(reading); applied = snapshot.revision; setAppliedRevision(applied); nextCalculation = Date.now() + (isSyncing ? 1500 : 0); sourceRecords = completeSnapshot.records; sourceOrders = completeSnapshot.orders; currentReading = reading; mappingOutdated = false; setLastReading(reading.importedAt); setError('')
      } catch (cause) { nextPoll = Date.now() + 15000; if (active && !abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Automatic delivery is unavailable; use manual upload as a fallback.') }
      finally { worker?.terminate(); worker = undefined; working = false; if (active) setPhase('idle') }
    }
    void poll()
    const timer = setInterval(() => { void poll() }, 3000)
    return () => { active = false; abort.abort(); worker?.terminate(); clearInterval(timer) }
  }, [options.enabled])
  const from = options.range?.from, to = options.range?.to
  useEffect(() => {
    if (!options.enabled || !status?.configured || !from || !to || from > to) return
    const abort = new AbortController()
    const timer = setTimeout(() => {
      const fromTime = Date.parse(`${from}T00:00:00+05:30`), toTime = Date.parse(`${to}T00:00:00+05:30`) + 86400000
      if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return
      void deliveryFetch('/api/report-sync/range', { method: 'POST', signal: abort.signal, headers: { 'Content-Type': 'application/json', 'X-Azulia-Intent': 'sync-report' }, body: JSON.stringify({ connectionKey: status.connectionKey, from: new Date(fromTime).toISOString(), to: new Date(toTime).toISOString() }) }).then(async response => { if (!response.ok) throw new Error('Could not queue missing history. Check the selected dates and local connection.') }).catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'History request failed.') })
    }, 400)
    return () => { clearTimeout(timer); abort.abort() }
  }, [options.enabled, status?.configured, status?.connectionKey, from, to])
  return { status, error, phase, calculating: phase !== 'idle', lastReading, appliedRevision, updatesPending: appliedRevision !== null && Boolean(status && status.revision > appliedRevision) }
}
