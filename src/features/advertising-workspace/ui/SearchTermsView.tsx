import { TableToolbar } from './TableToolbar'
import { TablePagination } from './TablePagination'
import { PerformanceTable } from './PerformanceTable'
import type { AdvertisingEntity, AdvertisingViewQuery, AdvertisingWorkspaceModel } from '../contract'

interface SearchTermsViewProps {
  readonly model: AdvertisingWorkspaceModel
  readonly formatMoney: (value: number) => string
  readonly onOpenEntity: (entity: AdvertisingEntity) => void
  readonly onQueryChange: (patch: Partial<AdvertisingViewQuery>) => void
}

export function SearchTermsView({ model, formatMoney, onOpenEntity, onQueryChange }: SearchTermsViewProps) {
  const { query, searchTerms, totalRows, pageSize } = model
  return <div className="adsw-table-card" aria-label="Customer search terms table">
    <TableToolbar query={query} onQueryChange={onQueryChange} searchPlaceholder="Search buyer query, target or campaign..." sortId="adsw-sort-terms" />
    <details className="adsw-source-explainer"><summary>About search terms &amp; attribution</summary>
      <p><strong>Customer search attribution:</strong> Buyer searches resulting in at least one click are distinct from targeting keywords. For multi-product ad groups, spend remains shared at the ad group level and is not allocated per SKU.</p>
      <p>An ASIN may represent another product’s page or placement; it does not prove the customer typed that identifier. Images come from available Amazon catalog data.</p>
    </details>
    <PerformanceTable rows={searchTerms} kind="searchTerm" formatMoney={formatMoney} onOpenEntity={onOpenEntity} />
    <TablePagination page={query.page} totalRows={totalRows} pageSize={pageSize} visibleRows={searchTerms.length} noun="search terms" onPageChange={page => onQueryChange({ page })} />
  </div>
}
