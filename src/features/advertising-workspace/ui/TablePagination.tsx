import { Pagination } from '../../../components/Pagination'

export function TablePagination({ page, totalRows, pageSize, visibleRows, noun, onPageChange }: {
  page: number; totalRows: number; pageSize: number; visibleRows: number; noun: string; onPageChange: (page: number) => void
}) {
  return <Pagination page={page} totalPages={Math.max(1, Math.ceil(totalRows / Math.max(1, pageSize)))} onPageChange={onPageChange}
    label={`${noun} table pages`} summary={`Showing ${visibleRows} of ${totalRows} ${noun}`}
    className="adsw-pagination" controlsClassName="adsw-pagination-nav" buttonClassName="adsw-btn" />
}
