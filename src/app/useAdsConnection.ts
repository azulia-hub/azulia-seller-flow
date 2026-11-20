import { useCallback, useEffect, useRef, useState } from 'react'
import { androidDevice, desktopDevice } from '../adapters/device/bridge'
import { nativeAdsFetch } from '../adapters/amazon-ads/native'
import { shiftAdsDate, validAdsDate } from '../adapters/amazon-ads/report'
import type { SponsoredProductsReport } from '../core/advertising/types'

export interface AdsConnectionStatus {
  configured: boolean; renewalConfigured: boolean; verified: boolean; accountName: string | null; profileId: string | null; sellerId?: string | null
  state: 'idle' | 'syncing' | 'error'; revision: number; lastSync: string | null; error: string | null
  from: string | null; to: string | null; rows: number; pending: number
}
const preference = 'azulia.ads-api.enabled'
export const adsFetch: typeof fetch = (input, init) => androidDevice ? nativeAdsFetch(input, init) : fetch(input, init)
function storedEnabled() { try { return localStorage.getItem(preference) !== 'false' } catch { return true } }
export async function adsResponse(response: Response) {
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Restart the local backend to enable Amazon Ads reporting.')
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? 'Cannot reach local advertising reports.')
  return body
}
export function useAdsConnection(options: { from: string; to: string; onReport: (report: SponsoredProductsReport | null) => void }) {
  const [enabled, setEnabled] = useState(storedEnabled), [status, setStatus] = useState<AdsConnectionStatus | null>(null), [error, setError] = useState<string | null>(null)
  const onReport = useRef(options.onReport), revision = useRef(-1), profile = useRef<string | null>(null), active = useRef(enabled)
  onReport.current = options.onReport; active.current = enabled
  useEffect(() => {
    if (!desktopDevice && !androidDevice) return
    let disposed = false, running = false
    const controller = new AbortController()
    async function poll() {
      if (running) return
      running = true
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])
        const next = await adsResponse(await adsFetch('/api/ads/status', { cache: 'no-store', signal })) as AdsConnectionStatus
        if (disposed) return
        setStatus(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next); setError(null)
        if (profile.current !== next.profileId) {
          if (profile.current && active.current) onReport.current(null)
          profile.current = next.profileId; revision.current = -1
        }
        if (!active.current || !next.configured || !next.profileId || next.revision === revision.current) return
        const response = await adsFetch(`/api/ads/report?profile=${encodeURIComponent(next.profileId)}&after=${revision.current}`, { cache: 'no-store', signal })
        if (response.status === 204) return
        const data = await adsResponse(response) as { profileId: string; revision: number; report: SponsoredProductsReport | null }
        if (disposed || !active.current || data.profileId !== profile.current) return
        if (data.report) {
          if (data.report.id !== `ads-api:${next.profileId}` || !Array.isArray(data.report.rows)) throw new Error('Advertising profile/report mismatch. Previous results retained.')
          onReport.current(data.report)
        }
        revision.current = data.revision
      } catch (cause) { if (!disposed) setError(cause instanceof Error ? cause.message : 'Local advertising connection unavailable.') }
      finally { running = false }
    }
    void poll(); const timer = setInterval(() => { void poll() }, 5000)
    return () => { disposed = true; controller.abort(); clearInterval(timer) }
  }, [])
  function useAutomatic(value: boolean) {
    active.current = value; revision.current = -1; setEnabled(value)
    try { localStorage.setItem(preference, String(value)) } catch { /* The running choice still applies. */ }
  }
  const request = useCallback(async (force = false, selected?: { from: string; to: string }) => {
    if ((!desktopDevice && !androidDevice) || !status?.profileId || !status.configured || !enabled) return
    const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10), oldest = shiftAdsDate(today, -94)
    const selectedFrom = selected?.from ?? options.from, selectedTo = selected?.to ?? options.to
    const from = validAdsDate(selectedFrom) ? selectedFrom < oldest ? oldest : selectedFrom : shiftAdsDate(today, -29)
    const to = validAdsDate(selectedTo) ? selectedTo > today ? today : selectedTo : today
    if (from > to) { setError('Selected dates are outside Amazon Ads’ last 95 days. Previously saved advertising data remains available.'); return }
    try {
      const next = await adsResponse(await adsFetch('/api/ads/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Azulia-Intent': 'sync-ads' },
        body: JSON.stringify({ profileId: status.profileId, from, to, force }), signal: AbortSignal.timeout(15000) }))
      setStatus(next); setError(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Advertising history could not be requested.') }
  }, [status?.profileId, status?.configured, enabled, options.from, options.to])
  useEffect(() => { void request() }, [request])
  return { supported: desktopDevice || androidDevice, enabled, status, error, useAutomatic, requestRange: request, refresh: (range?: { from: string; to: string }) => request(true, range) }
}
export type AdsConnection = ReturnType<typeof useAdsConnection>
