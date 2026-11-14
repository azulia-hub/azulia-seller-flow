import { hostedDelivery, syncHosted, hostedView } from '../amazon-hosted/client'
import { androidDevice, nativeRequest } from '../device/bridge'
import type { DateRange } from '../../core/analytics/timePeriods'

export type RefreshOutcome = 'complete' | 'queued'

interface Observer {
  readonly onProgress?: (message: string) => void
  readonly resolve: (outcome: RefreshOutcome) => void
  readonly reject: (error: unknown) => void
  readonly signal?: AbortSignal
}

interface ActiveCoordination {
  readonly observers: Set<Observer>
  readonly promise: Promise<RefreshOutcome>
}

const active = new Map<string, ActiveCoordination>()
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** One explicit request identity from the pull gesture through native fetch, merge and save. */
export function requestReportRefresh(
  range: DateRange,
  history = false,
  onProgress?: (message: string) => void,
  signal?: AbortSignal
): Promise<RefreshOutcome> {
  const key = JSON.stringify([range, history])
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Observation cancelled', 'AbortError'))
  }

  return new Promise<RefreshOutcome>((resolve, reject) => {
    const observer: Observer = { onProgress, resolve, reject, signal }

    const existing = active.get(key)
    if (existing) {
      existing.observers.add(observer)
      signal?.addEventListener('abort', () => {
        existing.observers.delete(observer)
        reject(new DOMException('Observation cancelled', 'AbortError'))
      }, { once: true })
      return
    }

    const observers = new Set<Observer>([observer])
    signal?.addEventListener('abort', () => {
      observers.delete(observer)
      reject(new DOMException('Observation cancelled', 'AbortError'))
    }, { once: true })

    const notifyProgress = (message: string) => {
      for (const obs of observers) {
        if (!obs.signal?.aborted) obs.onProgress?.(message)
      }
    }

    const notifyResolve = (outcome: RefreshOutcome) => {
      for (const obs of observers) {
        if (!obs.signal?.aborted) obs.resolve(outcome)
      }
      observers.clear()
    }

    const notifyReject = (err: unknown) => {
      for (const obs of observers) {
        if (!obs.signal?.aborted) obs.reject(err)
      }
      observers.clear()
    }

    const coordinator = (async (): Promise<RefreshOutcome> => {
      if (androidDevice) {
        const requestId = crypto.randomUUID()
        await nativeRequest('sync.request', { ...range, force: history, requestId })
        const deadline = Date.now() + 8 * 60000
        while (Date.now() < deadline) {
          await pause(750)
          // If all observers unmounted / cancelled, cease polling native status without cancelling background sync.
          if (!observers.size) return 'queued'
          const result = await nativeRequest<{ state: string; error?: string }>('sync.request-status', { requestId })
          notifyProgress(result.state === 'running' ? 'Fetching and saving the latest orders…' : 'Refresh queued; waiting for the active sync or Android/network allowance.')
          if (result.state === 'complete') {
            notifyResolve('complete')
            return 'complete'
          }
          if (result.state === 'error' || result.state === 'unknown') {
            const error = new Error(result.error || 'Refresh needs attention. Saved results are retained.')
            notifyReject(error)
            throw error
          }
        }
        notifyResolve('queued')
        return 'queued' // A delayed OS/network request remains queued; never announce a false completion.
      }
      if (hostedDelivery) {
        const deadline = Date.now() + 3 * 60000
        while (hostedView().busy && Date.now() < deadline) {
          await pause(500)
          if (!observers.size) return 'queued'
        }
        if (hostedView().busy) {
          const error = new Error('The current sync is still running. Your extra refresh has not started; retry after it completes.')
          notifyReject(error)
          throw error
        }
        await syncHosted(range, { forceRecent: true, forceHistory: history })
        if (hostedView().error) {
          const error = new Error(hostedView().error)
          notifyReject(error)
          throw error
        }
        notifyResolve('complete')
        return 'complete'
      }
      const response = await fetch('/api/report-sync/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Azulia-Intent': 'sync-report' },
        body: JSON.stringify({ ...range, forceHistory: history }),
      })
      if (!response.ok) {
        const error = new Error('Could not request refreshed history. Saved results remain available.')
        notifyReject(error)
        throw error
      }
      notifyResolve('queued')
      return 'queued'
    })()

    active.set(key, { observers, promise: coordinator })
    void coordinator.finally(() => {
      active.delete(key)
    })
  })
}
