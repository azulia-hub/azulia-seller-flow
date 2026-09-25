import { useEffect, useRef } from 'react'

/** Keeps newly opened in-place detail visible inside either the page or a drilldown. */
export function useScrollDetailIntoView<T extends HTMLElement>(identity: string) {
  const ref = useRef<T>(null)

  useEffect(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    const frame = window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [identity])

  return ref
}

export function useScrollSelectedDetail(identity: string | null, selector: string) {
  useEffect(() => {
    if (!identity) return
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [identity, selector])
}
