import { useId } from 'react'
import { ChoiceGroup } from '../../../components/ChoiceGroup'
import { TableToolbar } from './TableToolbar'
import { TablePagination } from './TablePagination'
import { PerformanceTable } from './PerformanceTable'
import type { AdvertisingEntity, AdvertisingViewQuery, AdvertisingWorkspaceModel, SearchTermField, SearchTermQuery } from '../contract'

const searchFields: readonly { value: SearchTermField; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'CUSTOMER', label: 'Customer search term' },
  { value: 'TARGET', label: 'Target keyword / ASIN' },
]

export function SearchTermsControls({ query, onQueryChange }: {
  readonly query: SearchTermQuery
  readonly onQueryChange: (patch: Partial<SearchTermQuery> & { page: number }) => void
}) {
  const sortId = useId()
  return <>
    <TableToolbar query={query} onQueryChange={patch => onQueryChange({ ...patch, page: 1 })} searchPlaceholder="Search buyer query, target or campaign..." sortId={sortId} />
    <ChoiceGroup className="adsw-search-fields" label="Search in" value={query.searchTermField ?? 'ALL'} options={searchFields}
      onChange={searchTermField => onQueryChange({ searchTermField, page: 1 })} />
  </>
}

interface SearchTermsViewProps {
  readonly model: AdvertisingWorkspaceModel
  readonly formatMoney: (value: number) => string
  readonly onOpenEntity: (entity: AdvertisingEntity) => void
  readonly onQueryChange: (patch: Partial<AdvertisingViewQuery>) => void
}

export function SearchTermsView({ model, formatMoney, onOpenEntity, onQueryChange }: SearchTermsViewProps) {
  const { query, searchTerms, searchTermTotals, totalRows, pageSize } = model
  return <div className="adsw-table-card" aria-label="Customer search terms table">
    <SearchTermsControls query={query} onQueryChange={onQueryChange} />
    <details className="adsw-source-explainer"><summary>About search terms &amp; attribution</summary>
      <p><strong>Customer search attribution:</strong> Buyer searches resulting in at least one click are distinct from targeting keywords. For multi-product ad groups, spend remains shared at the ad group level and is not allocated per SKU.</p>
      <p>Negative badges reflect enabled exclusions in the latest synced settings for the row’s campaign or ad group. Amazon may also match close keyword variations. Performance still reflects the selected report dates.</p>
      <p>An ASIN may represent another product’s page or placement; it does not prove the customer typed that identifier. Images come from available Amazon catalog data.</p>
    </details>
    <PerformanceTable rows={searchTerms} kind="searchTerm" totals={searchTermTotals && { metrics: searchTermTotals, label: searchTermTotals.filtered ? 'Matching terms total' : 'All search terms total' }} sorting={{ query, onQueryChange }} formatMoney={formatMoney} onOpenEntity={onOpenEntity} />
    <TablePagination page={query.page} totalRows={totalRows} pageSize={pageSize} visibleRows={searchTerms.length} noun="search terms" onPageChange={page => onQueryChange({ page })} />
  </div>
}
