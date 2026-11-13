import { useState, useEffect, useRef } from 'react'
import { deviceImageUrl } from '../adapters/device/images'
import { androidDevice } from '../adapters/device/bridge'
export function ProductThumbnail({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false)
  const [source, setSource] = useState<string | null>(null)
  const element = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let active = true, started = false
    let observer: IntersectionObserver | undefined
    setSource(null); setFailed(false)
    const load = () => { setFailed(false); setSource(null); if (url) void deviceImageUrl(url).then(value => { if (active) setSource(value) }).catch(() => { if (active) setFailed(true) }) }
    if (androidDevice && typeof IntersectionObserver !== 'undefined' && element.current) {
      observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { started = true; observer?.disconnect(); load() } }, { rootMargin: '200px' })
      observer.observe(element.current)
    } else { started = true; load() }
    const online = () => { if (started) load() }
    window.addEventListener('online', online)
    return () => { active = false; observer?.disconnect(); window.removeEventListener('online', online) }
  }, [url])
  return <span ref={element} className="product-thumbnail" aria-hidden="true">{source && !failed ? <img src={source} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span title="Product image not available">▧</span>}</span>
}
