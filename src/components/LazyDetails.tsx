import { useState, type ReactNode } from 'react'
/** Closed disclosures do not mount expensive charts and analytical tables. */
export function LazyDetails({ summary, className = 'seller-disclosure', children }: { summary: string; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return <details className={className} onToggle={event => setOpen(event.currentTarget.open)}><summary>{summary}</summary>{open ? children : null}</details>
}
