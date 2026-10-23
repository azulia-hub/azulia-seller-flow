import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Visible sections mount heavier content as they approach the viewport, without a disclosure. */
export function ContentSection({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === 'undefined') { setReady(true); return }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setReady(true); observer.disconnect() }
    }, { rootMargin:'400px' })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return <section ref={ref} id={id} className="product-content-section" aria-label={title}><h3>{title}</h3>{ready ? children : <div className="section-loading" aria-hidden="true" />}</section>
}
