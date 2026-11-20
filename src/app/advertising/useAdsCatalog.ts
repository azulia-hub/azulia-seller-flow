import { useEffect, useState } from 'react'
import { adsFetch, adsResponse } from '../useAdsConnection'
import { adsMetadataKey, readAdsMetadata, writeAdsMetadata } from '../../adapters/amazon-ads/metadataCache'
export interface AdsCatalogItem { asin: string; title: string | null; imageUrl: string | null; checkedAt: number; error?: string }
export function useAdsCatalog(profile: string | null, enabled: boolean, asins: readonly string[]) {
  const [value, setValue] = useState<{ profile: string; items: Record<string, AdsCatalogItem> }>({ profile: '', items: {} })
  const selection = [...new Set(asins.filter(asin => /^[A-Z0-9]{10}$/.test(asin)))].sort().join(',')
  useEffect(() => {
    if (!enabled || !profile || !selection) return
    let active = true
    const controller = new AbortController()
    void (async () => {
      const key = await adsMetadataKey(profile, 'catalog'), items = await readAdsMetadata<Record<string, AdsCatalogItem>>(key).catch(() => null) ?? {}
      if (active) setValue({ profile, items: { ...items } })
      for (const asin of selection.split(',')) {
        if (!active) break
        if (items[asin] && Date.now() - items[asin].checkedAt < (items[asin].error ? 3600000 : 7 * 86400000)) continue
        try {
          const result = await adsResponse(await adsFetch(`/api/ads/catalog?${new URLSearchParams({ profile, asin })}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(35000)]) })) as AdsCatalogItem
          if (result.asin !== asin) throw new Error('Catalog identity mismatch.')
          items[asin] = { ...result, checkedAt: Date.now() }
        } catch (cause) { items[asin] = { asin, title: items[asin]?.title ?? null, imageUrl: items[asin]?.imageUrl ?? null, checkedAt: Date.now(), error: cause instanceof Error ? cause.message : 'Catalog image unavailable.' } }
        if (!active) break
        setValue({ profile, items: { ...items } })
        await writeAdsMetadata(key, items).catch(() => {})
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    })().catch(() => {})
    return () => { active = false; controller.abort() }
  }, [profile, enabled, selection])
  return enabled && value.profile === profile ? value.items : {}
}
