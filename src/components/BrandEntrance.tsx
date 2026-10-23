import { useLayoutEffect, useRef, useState } from 'react'

function shouldEnter() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  try { return sessionStorage.getItem('azulia-brand-entered') !== 'yes' } catch { return true }
}

/** A short once-per-tab introduction; analytics and report loading continue underneath. */
export function BrandEntrance() {
  const [active, setActive] = useState(shouldEnter)
  const overlay = useRef<HTMLDivElement>(null)
  const logo = useRef<HTMLImageElement>(null)
  useLayoutEffect(() => {
    if (!active || !overlay.current || !logo.current) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const animations: Animation[] = []
    let disposed = false
    let fallback: ReturnType<typeof setTimeout> | undefined
    const finish = () => {
      if (disposed) return
      delete document.documentElement.dataset.brandEntering
      setActive(false)
    }
    const skip = () => { animations.forEach(animation => animation.cancel()); finish() }
    document.documentElement.dataset.brandEntering = 'true'
    try { sessionStorage.setItem('azulia-brand-entered', 'yes') } catch { /* Session-only presentation. */ }
    const start = () => {
      if (disposed) return
      const target = [...document.querySelectorAll<HTMLElement>('.workspace-logo,.mobile-brand-logo')].find(element => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 && rect.left >= 0 && getComputedStyle(element).visibility !== 'hidden'
      })
      if (!target || !logo.current?.animate) { finish(); return }
      const bounds = target.getBoundingClientRect()
      const startX = (innerWidth - 192) / 2, startY = (innerHeight - 192) / 2
      const centered = `translate(${startX}px,${startY}px) scale(1)`
      const movement = logo.current.animate([
        { transform:`translate(${startX}px,${startY + 8}px) scale(.92)`, opacity:0, offset:0 },
        { transform:centered, opacity:1, offset:.2 },
        { transform:centered, opacity:1, offset:.4 },
        { transform:`translate(${bounds.left}px,${bounds.top}px) scale(${bounds.width / 192})`, opacity:1, offset:1 },
      ], { duration:1100, easing:'cubic-bezier(.22,.7,.22,1)', fill:'forwards' })
      animations.push(movement)
      animations.push(overlay.current!.animate([{ backgroundColor:'var(--bg)' }, { backgroundColor:'transparent' }], { duration:650, delay:450, fill:'forwards' }))
      fallback = setTimeout(() => { if (!disposed) document.documentElement.dataset.brandEntering = 'revealing' }, 500)
      movement.finished.then(finish).catch(() => { /* Cleanup or reduced motion cancels safely. */ })
    }
    const image = logo.current
    if (image.complete && image.naturalWidth) start()
    else { image.addEventListener('load', start, { once:true }); image.addEventListener('error', finish, { once:true }) }
    const timeout = setTimeout(finish, 1800)
    window.addEventListener('resize', skip, { once:true })
    media.addEventListener('change', skip)
    return () => {
      disposed = true; clearTimeout(timeout); clearTimeout(fallback)
      animations.forEach(animation => animation.cancel())
      image.removeEventListener('load', start); image.removeEventListener('error', finish)
      window.removeEventListener('resize', skip); media.removeEventListener('change', skip)
      delete document.documentElement.dataset.brandEntering
    }
  }, [active])
  return active ? <div className="brand-entrance" ref={overlay} aria-hidden="true"><img ref={logo} src={`${import.meta.env.BASE_URL}brand/azulia-logo.webp`} alt="" width="192" height="192" /></div> : null
}
