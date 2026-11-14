import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
interface Props { enabled: boolean; error?: string; onRefresh: (onProgress: (message: string) => void, signal?: AbortSignal) => Promise<unknown> }
type Phase = 'idle' | 'pulling' | 'armed' | 'refreshing' | 'done' | 'error' | 'queued'
const threshold = 64
function atTop(target: EventTarget | null) {
  let node = target instanceof Element ? target : null
  while (node && node !== document.documentElement) {
    if (node.scrollTop > 0 && node.scrollHeight > node.clientHeight + 1) return false
    node = node.parentElement
  }
  return window.scrollY <= 0
}
export function PullToRefresh(props: Props) {
  const latest = useRef(props); latest.current = props
  const indicator = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [message, setMessage] = useState('')
  useEffect(() => {
    let start: { x: number; y: number } | null = null, pull = 0, frame = 0
    let active = false, disposed = false
    let activeController: AbortController | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const root = document.documentElement
    const previous = root.style.overscrollBehaviorY
    root.style.overscrollBehaviorY = 'contain'
    const paint = (distance: number, dragging = false) => {
      root.style.setProperty('--refresh-offset', `${Math.min(distance * .35, 30)}px`)
      root.dataset.refreshDragging = String(dragging)
      indicator.current?.style.setProperty('--pull-distance', `${distance}px`)
      indicator.current?.style.setProperty('--pull-rotation', `${distance * 4}deg`)
    }
    const reset = () => { active = false; paint(0); if (!disposed) setPhase('idle') }
    const refresh = () => {
      if (active || !latest.current.enabled) return
      active = true
      setPhase('refreshing'); setMessage('Refreshing data'); paint(60)
      activeController?.abort()
      const controller = new AbortController()
      activeController = controller
      void latest.current.onRefresh(message => { if (!disposed) setMessage(message) }, controller.signal).then(outcome => {
        if (disposed) return
        const queued = outcome === 'queued'
        setMessage(queued ? 'Refresh is queued. Saved results remain visible.' : 'Refresh complete')
        setPhase(queued ? 'queued' : 'done'); paint(50)
        timer = setTimeout(reset, queued ? 2500 : 650)
      }).catch(cause => {
        if (disposed) return
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        clearTimeout(timer); active = false; setPhase('error'); paint(50)
        setMessage(cause instanceof Error ? cause.message : 'Could not refresh. Your saved results remain available. Pull to retry.')
        timer = setTimeout(reset, 1800)
      })
    }
    const begin = (event: TouchEvent) => {
      if (active || !latest.current.enabled || event.touches.length !== 1 || !atTop(event.target)) return
      if (event.target instanceof Element && event.target.closest('dialog,input,textarea,select,button,a,[role="slider"],.table-scroll,svg,canvas')) return
      clearTimeout(timer); start = { x: event.touches[0].clientX, y: event.touches[0].clientY }; pull = 0
    }
    const cancel = () => { start = null; pull = 0; cancelAnimationFrame(frame); if (!active) { paint(0); setPhase('idle') } }
    const move = (event: TouchEvent) => {
      if (!start) return
      if (event.touches.length !== 1) { cancel(); return }
      const dx = event.touches[0].clientX - start.x, dy = event.touches[0].clientY - start.y
      if (dy <= 0 || Math.abs(dx) > dy || !atTop(event.target)) { cancel(); return }
      if (dy < 10) return
      if (event.cancelable) event.preventDefault()
      pull = 96 * (1 - Math.exp(-(dy - 10) / 130))
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => { paint(pull, true); setPhase(pull >= threshold ? 'armed' : 'pulling') })
    }
    const end = () => { if (!start) return; start = null; cancelAnimationFrame(frame); const trigger = pull >= threshold; pull = 0; if (trigger) refresh(); else { paint(0); setPhase('idle') } }
    const keyboard = (event: KeyboardEvent) => { if (event.altKey && event.key.toLowerCase() === 'r' && latest.current.enabled) { event.preventDefault(); refresh() } }
    document.addEventListener('touchstart', begin, { passive: true })
    document.addEventListener('touchmove', move, { passive: false })
    document.addEventListener('touchend', end); document.addEventListener('touchcancel', cancel); document.addEventListener('keydown', keyboard)
    return () => {
      disposed = true; activeController?.abort(); clearTimeout(timer); cancelAnimationFrame(frame)
      root.style.overscrollBehaviorY = previous; root.style.removeProperty('--refresh-offset'); delete root.dataset.refreshDragging
      document.removeEventListener('touchstart', begin); document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', end); document.removeEventListener('touchcancel', cancel); document.removeEventListener('keydown', keyboard)
    }
  }, [])
  return createPortal(<><div ref={indicator} className="pull-refresh-orb" data-phase={phase} aria-hidden="true"><svg viewBox="0 0 32 32"><circle className="pull-refresh-track" cx="16" cy="16" r="11"/><circle className="pull-refresh-arc" cx="16" cy="16" r="11"/><path className="pull-refresh-check" d="m9 16 5 5 9-10"/></svg></div>{phase === 'error' || phase === 'queued' || phase === 'refreshing' ? <div className="pull-refresh-notice">{message}</div> : null}<span className="pull-refresh-announcement" role="status" aria-live="polite">{phase === 'armed' ? 'Release to refresh' : phase === 'done' ? 'Refresh complete' : message}</span></>, document.body)
}
