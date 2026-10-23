import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppPage } from './navigation'
import type { MetricDrilldownId } from '../core/analytics/metricDrilldown'

export interface ProductSelection { sku: string; scope: 'CURRENT' | 'POSTED' | 'REPORT' }
interface ProductOrigin { page: AppPage; metric: MetricDrilldownId | null }
interface ReturnPosition extends ProductOrigin { scroll: number }

function productFromHash(): ProductSelection | null {
  const match = window.location.hash.match(/^#product\/([^?]+)(?:\?scope=(CURRENT|POSTED|REPORT))?$/)
  if (!match) return null
  try { const sku = decodeURIComponent(match[1]); return sku ? { sku, scope: (match[2] as ProductSelection['scope']) || 'CURRENT' } : null } catch { return null }
}
const baseUrl = () => `${window.location.pathname}${window.location.search}`

/** Product pages use hash history so static hosting needs no route rewrite. */
export function useProductPage(onReturn: (origin: ProductOrigin) => void, cancelPreview: () => void) {
  const [selection, setSelection] = useState<ProductSelection | null>(productFromHash)
  const active = useRef(Boolean(selection))
  const origin = useRef<ReturnPosition | null>(window.history.state?.azuliaProductReturn ?? null)
  const focus = useRef<HTMLElement | null>(null)
  const returnHandler = useRef(onReturn)
  returnHandler.current = onReturn

  useEffect(() => {
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    function pop() {
      const next = productFromHash(), leaving = active.current && !next
      active.current = Boolean(next); cancelPreview(); setSelection(next)
      if (next) {
        origin.current = window.history.state?.azuliaProductReturn ?? origin.current
        if (origin.current) returnHandler.current({ page: origin.current.page, metric: null })
        window.scrollTo(0, 0)
      }
      else if (leaving) {
        const destination = origin.current ?? { page: 'Products' as const, metric: null, scroll: 0 }
        returnHandler.current(destination)
        requestAnimationFrame(() => requestAnimationFrame(() => {
          window.scrollTo(0, destination.scroll)
          if (focus.current?.isConnected) focus.current.focus({ preventScroll: true })
        }))
      }
    }
    window.addEventListener('popstate', pop)
    return () => { window.removeEventListener('popstate', pop); window.history.scrollRestoration = previous }
  }, [cancelPreview])

  const open = useCallback((next: ProductSelection, from: ProductOrigin) => {
    if (!active.current) {
      origin.current = { ...from, scroll: window.scrollY }
      focus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      window.history.replaceState({ ...window.history.state, azuliaWorkspace: from }, '', window.location.href)
      window.history.pushState({ azuliaProductEntry: true, azuliaProductReturn: origin.current }, '', `${baseUrl()}#product/${encodeURIComponent(next.sku)}?scope=${next.scope}`)
    } else window.history.replaceState({ ...window.history.state }, '', `${baseUrl()}#product/${encodeURIComponent(next.sku)}?scope=${next.scope}`)
    active.current = true; cancelPreview(); setSelection(next)
    requestAnimationFrame(() => window.scrollTo(0, 0))
  }, [cancelPreview])

  const clear = useCallback(() => {
    if (productFromHash()) window.history.replaceState(null, '', baseUrl())
    active.current = false; origin.current = null; focus.current = null; cancelPreview(); setSelection(null)
  }, [cancelPreview])

  const back = useCallback(() => {
    if (window.history.state?.azuliaProductEntry && productFromHash()) window.history.back()
    else { clear(); returnHandler.current({ page: 'Products', metric: null }); window.scrollTo(0, 0) }
  }, [clear])

  return { productSelection: selection, openProductPage: open, clearProductPage: clear, closeProductPage: back }
}
