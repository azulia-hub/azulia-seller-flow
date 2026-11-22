import type { ReactNode } from 'react'

interface PaginationProps {
  readonly page: number
  readonly totalPages: number
  readonly onPageChange: (page: number) => void
  readonly summary?: ReactNode
  readonly label: string
  readonly className?: string
  readonly controlsClassName?: string
  readonly buttonClassName?: string
  readonly previousLabel?: string
  readonly nextLabel?: string
}

/** Presentation only: callers retain ownership of source data and page selection. */
export function Pagination({ page, totalPages, onPageChange, summary, label, className, controlsClassName, buttonClassName, previousLabel = '← Previous', nextLabel = 'Next →' }: PaginationProps) {
  return <nav className={className} aria-label={label}>
    {summary !== undefined ? <span>{summary}</span> : null}
    <div className={controlsClassName}>
      <button type="button" className={buttonClassName} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>{previousLabel}</button>
      <span>Page {page} of {totalPages}</span>
      <button type="button" className={buttonClassName} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>{nextLabel}</button>
    </div>
  </nav>
}
