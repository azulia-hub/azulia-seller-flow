import { useEffect, useRef } from 'react'

/** Keyboard containment and focus return for the workspace's modal investigations. */
export function useDialogFocus(open: boolean, close: () => void) {
  const root = useRef<HTMLDivElement>(null), onClose = useRef(close)
  onClose.current = close
  useEffect(() => {
    if (!open || !root.current) return
    const element = root.current, previous = document.activeElement as HTMLElement | null
    const focusable = () => [...element.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter(item => item.getClientRects().length > 0)
    focusable()[0]?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose.current(); return }
      if (event.key !== 'Tab') return
      const items = focusable(), first = items[0], last = items[items.length - 1]
      if (!first) { event.preventDefault(); return }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    function handleOutsideEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || element.contains(event.target as Node)) return
      const activeDialog = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]'))
        .filter(dialog => dialog.getClientRects().length > 0).at(-1)
      if (activeDialog === element) keydown(event)
    }
    element.addEventListener('keydown', keydown)
    document.addEventListener('keydown', handleOutsideEscape)
    return () => {
      element.removeEventListener('keydown', keydown)
      document.removeEventListener('keydown', handleOutsideEscape)
      if (previous?.isConnected) previous.focus()
    }
  }, [open])
  return root
}
