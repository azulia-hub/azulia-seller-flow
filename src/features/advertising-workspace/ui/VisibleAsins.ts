import { createContext, useContext, useEffect } from 'react'
export const VisibleAdsAsins = createContext<((asins: readonly string[]) => void) | null>(null)
/** Presentation reports which image identities the current detail page exposes. */
export function useVisibleAdsAsins(asins: readonly (string | null | undefined)[]) {
  const update = useContext(VisibleAdsAsins), key = [...new Set(asins.filter((asin): asin is string => Boolean(asin)))].sort().join(',')
  useEffect(() => { update?.(key ? key.split(',') : []); return () => update?.([]) }, [update, key])
}
