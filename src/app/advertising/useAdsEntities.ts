import { useEffect, useState } from 'react'
import { adsFetch, adsResponse } from '../useAdsConnection'
import { adsEntityKinds, type AdsEntitySnapshot, type AdsEntityPage } from '../../adapters/amazon-ads/entities'
import { adsMetadataKey, readAdsMetadata, writeAdsMetadata } from '../../adapters/amazon-ads/metadataCache'

export function useAdsEntities(profileId: string | null, enabled: boolean, refresh: number) {
  const [value, setValue] = useState<{ profileId: string; snapshot: AdsEntitySnapshot; errors: string[] } | null>(null)
  useEffect(() => {
    if (!profileId || !enabled) return
    let active = true
    const controller = new AbortController()
    void (async () => {
      const key = await adsMetadataKey(profileId, 'configuration')
      const snapshot = await readAdsMetadata<AdsEntitySnapshot>(key).catch(() => null) ?? {}
      const errors: string[] = []
      const publish = () => { if (active) setValue({ profileId, snapshot: { ...snapshot }, errors: [...errors] }) }
      publish()
      for (const kind of adsEntityKinds) {
        if (!active) break
        if (!refresh && snapshot[kind]?.complete && Date.now() - Date.parse(snapshot[kind]!.observedAt) < 30 * 60000) continue
        try {
          let nextToken: string | null = null, observedAt = '', complete = false
          const rows: Readonly<Record<string, unknown>>[] = [], seen = new Set<string>()
          for (let page = 0; page < 100; page++) {
            const query = new URLSearchParams({ profile: profileId, kind, ...(nextToken ? { nextToken } : {}) })
            const result = await adsResponse(await adsFetch(`/api/ads/entities?${query}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]), cache: 'no-store' })) as AdsEntityPage
            if (result.profileId !== profileId || result.kind !== kind || !Array.isArray(result.rows)) throw new Error('Configuration identity mismatch.')
            rows.push(...result.rows); observedAt = result.observedAt; nextToken = result.nextToken
            if (!nextToken) { complete = true; break }
            if (seen.has(nextToken)) throw new Error('Repeated configuration continuation. Previous complete reading retained.')
            seen.add(nextToken)
            await new Promise(resolve => setTimeout(resolve, 350))
          }
          if (!complete) throw new Error('Configuration is larger than one bounded scan. Previous complete reading retained.')
          if (!active) break
          snapshot[kind] = { rows, observedAt, complete: true }
          await writeAdsMetadata(key, snapshot).catch(() => { errors.push('Configuration cache could not be saved for offline use.') })
        } catch (cause) { errors.push(`${kind}: ${cause instanceof Error ? cause.message : 'Configuration unavailable.'}`) }
        publish()
      }
    })().catch(cause => { if (active) setValue({ profileId, snapshot: {}, errors: [cause instanceof Error ? cause.message : 'Configuration unavailable.'] }) })
    return () => { active = false; controller.abort() }
  }, [profileId, enabled, refresh])
  return value?.profileId === profileId && enabled ? value : null
}
