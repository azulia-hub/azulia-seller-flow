import type { AdvertisingViewQuery } from '../contract'

interface TableToolbarProps {
  readonly query: Pick<AdvertisingViewQuery, 'search' | 'sort' | 'direction'>
  readonly onQueryChange: (patch: Partial<AdvertisingViewQuery>) => void
  readonly searchPlaceholder: string
  readonly sortId: string
  readonly spendLabel?: string
  readonly purchasesLabel?: string
}

/** Shared interactions; each table keeps its own source labels and columns. */
export function TableToolbar({ query, onQueryChange, searchPlaceholder, sortId, spendLabel = 'Spend', purchasesLabel = 'Purchases' }: TableToolbarProps) {
  return <div className="adsw-table-toolbar">
    <div className="adsw-search-box">
      <span className="adsw-search-icon" aria-hidden="true">🔍</span>
      <input type="search" className="adsw-search-input" aria-label={searchPlaceholder} placeholder={searchPlaceholder} value={query.search} onChange={event => onQueryChange({ search: event.target.value, page: 1 })} />
    </div>
    <div className="adsw-sort-controls">
      <label className="adsw-label" htmlFor={sortId}>Sort by:</label>
      <select id={sortId} className="adsw-select" value={query.sort} onChange={event => onQueryChange({ sort: event.target.value as AdvertisingViewQuery['sort'], sortSelected: true, page: 1 })}>
        <option value="SPEND">{spendLabel}</option>
        <option value="SALES">Attributed Sales</option>
        <option value="ACOS">ACOS</option>
        <option value="ROAS">ROAS</option>
        <option value="PURCHASES">{purchasesLabel}</option>
      </select>
      <button type="button" className="adsw-btn" style={{ minHeight: 36, padding: '4px 10px', fontSize: 12 }} onClick={() => onQueryChange({ direction: query.direction === 'DESC' ? 'ASC' : 'DESC', sortSelected: true, page: 1 })} aria-label={`Sort direction: ${query.direction === 'DESC' ? 'Descending' : 'Ascending'}`}>
        {query.direction === 'DESC' ? '↓ High to low' : '↑ Low to high'}
      </button>
    </div>
  </div>
}
