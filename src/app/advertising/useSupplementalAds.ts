import { getIndiaToday } from '../../core/sync/planner'
import { useEffect, useState } from 'react'
import { adsFetch, adsResponse, type AdsConnectionStatus } from '../useAdsConnection'
import { parseSupplementalRows, supplementalWorkspaceSource, type AdsSupplementalKind, type AdsSupplementalReport } from '../../adapters/amazon-ads/supplemental'
import { shiftAdsDate, validAdsDate } from '../../adapters/amazon-ads/report'
import type { WorkspaceSupplementalSources } from './supplementalModel'

const kinds: AdsSupplementalKind[] = ['searchTerm', 'purchasedProduct', 'targeting']
export function useSupplementalAds(options: { enabled: boolean; profileId: string | null; from: string; to: string; refresh: number }) {
  const [reading, setReading] = useState<{ profileId: string; sources: WorkspaceSupplementalSources; errors: readonly string[]; busy: boolean } | null>(null)
  useEffect(() => {
    if (!options.enabled || !options.profileId) return
    const profileId = options.profileId, controller = new AbortController()
    let disposed = false, polling = false
    const sources: { -readonly [K in keyof WorkspaceSupplementalSources]?: WorkspaceSupplementalSources[K] } = {}, errors = new Map<string, string>()
    const revisions = new Map<string, number>()
    const publish = (busy: boolean) => { if (!disposed) setReading(previous => {
      const messages = [...errors.values()]
      if (previous?.profileId === profileId && previous.busy === busy && kinds.every(kind => previous.sources[kind] === sources[kind]) && JSON.stringify(previous.errors) === JSON.stringify(messages)) return previous
      return { profileId, sources: { ...sources }, errors: messages, busy }
    }) }
    async function poll() {
      if (polling) return
      polling = true
      try {
        for (const kind of kinds) {
          if (disposed) break
          try {
            const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)])
            const status = await adsResponse(await adsFetch(`/api/ads/status?kind=${kind}`, { cache: 'no-store', signal })) as AdsConnectionStatus
            if (status.profileId !== profileId) throw new Error('Advertising account changed. Reopen Advertising.')
            if (status.error) errors.set(kind, `${kind}: ${status.error}`); else errors.delete(kind)
            if (status.revision === revisions.get(kind)) continue
            const response = await adsFetch(`/api/ads/dataset?kind=${kind}&profile=${encodeURIComponent(profileId)}&after=${revisions.get(kind) ?? -1}`, { cache: 'no-store', signal })
            if (response.status === 204) continue
            const result = await adsResponse(response) as { kind: string; profileId: string; revision: number; report: AdsSupplementalReport | null }
            if (result.kind !== kind || result.profileId !== profileId) throw new Error('Report account/kind mismatch. Previous results retained.')
            if (result.report) {
              if (result.report.profileId !== profileId || result.report.kind !== kind) throw new Error('Unexpected report identity.')
              parseSupplementalRows(result.report.rows, { from: result.report.minDate, to: result.report.maxDate }, kind)
              sources[kind] = supplementalWorkspaceSource(result.report)
            }
            revisions.set(kind, result.revision)
          } catch (cause) { errors.set(kind, `${kind}: ${cause instanceof Error ? cause.message : 'Source unavailable.'}`) }
        }
      } finally { polling = false; publish(false) }
    }
    async function request() {
      const today = getIndiaToday()
      if (!validAdsDate(options.from) || !validAdsDate(options.to)) return
      const from = options.from < shiftAdsDate(today, -94) ? shiftAdsDate(today, -94) : options.from, to = options.to > today ? today : options.to
      if (from > to) return
      publish(true)
      for (const kind of kinds) {
        try {
          await adsResponse(await adsFetch('/api/ads/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Azulia-Intent': 'sync-ads' }, body: JSON.stringify({ kind, profileId, from, to, force: options.refresh > 0 }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) }))
        } catch (cause) { errors.set(kind, `${kind}: ${cause instanceof Error ? cause.message : 'History request failed.'}`) }
        if (disposed) return
      }
      await poll()
    }
    void request(); const timer = setInterval(() => { void poll() }, 15000)
    return () => { disposed = true; controller.abort(); clearInterval(timer) }
  }, [options.enabled, options.profileId, options.from, options.to, options.refresh])
  return reading?.profileId === options.profileId && options.enabled ? reading : null
}
