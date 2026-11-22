import { useState } from 'react'
import { Pagination } from '../../../components/Pagination'
export function useDetailPage<T>(rows: readonly T[]) {
  const [requested, setPage] = useState(1), pageSize = 30
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize)), page = Math.min(requested, totalPages)
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), page, totalPages, setPage, count: rows.length }
}
export function DetailPagination({ page, totalPages, count, setPage }: { page: number; totalPages: number; count: number; setPage: (value: number) => void }) {
  if (totalPages <= 1) return null
  return <Pagination page={page} totalPages={totalPages} onPageChange={setPage} label="Detail table pages" summary={`${count} rows`} className="adsw-pagination" controlsClassName="adsw-pagination-nav" buttonClassName="adsw-btn" previousLabel="Previous rows" nextLabel="Next rows" />
}
