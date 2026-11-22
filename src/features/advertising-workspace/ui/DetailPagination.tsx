import { useState } from 'react'
export function useDetailPage<T>(rows: readonly T[]) {
  const [requested, setPage] = useState(1), pageSize = 30
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize)), page = Math.min(requested, totalPages)
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), page, totalPages, setPage, count: rows.length }
}
export function DetailPagination({ page, totalPages, count, setPage }: { page: number; totalPages: number; count: number; setPage: (value: number) => void }) {
  if (totalPages <= 1) return null
  return <nav className="adsw-pagination" aria-label="Detail table pages"><span>Page {page} of {totalPages} · {count} rows</span><button type="button" className="adsw-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous rows</button><button type="button" className="adsw-btn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next rows</button></nav>
}
