import { AdsIdentity } from './AdsIdentity'
import { RecommendationNote } from './RecommendationNote'
import type {
  AdvertisingEntity,
  AdvertisingViewQuery,
  AdvertisingWorkspaceModel,
} from '../contract'
import {
  formatInteger,
  formatMultiplier,
  formatPercent,
} from './formatters'

interface SearchTermsViewProps {
  readonly model: AdvertisingWorkspaceModel
  readonly formatMoney: (n: number) => string
  readonly onOpenEntity: (entity: AdvertisingEntity) => void
  readonly onQueryChange: (patch: Partial<AdvertisingViewQuery>) => void
}

export function SearchTermsView({
  model,
  formatMoney,
  onOpenEntity,
  onQueryChange,
}: SearchTermsViewProps) {
  const { query, searchTerms, totalRows, pageSize } = model
  const totalPages = Math.max(1, Math.ceil(totalRows / Math.max(1, pageSize)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="adsw-banner adsw-banner-partial" style={{ fontSize: 12 }}>
        <strong>Customer search attribution:</strong> Reflects actual buyer searches resulting in
        at least one click. Distinct from targeting keywords. For multi-product ad groups, search
        term spend remains shared at the ad group level and is not artificially allocated per-SKU.
      </div>

      <div className="adsw-table-card" aria-label="Customer search terms table">
        <p className="adsw-cell-sub">An ASIN can represent another product’s page or placement; it does not prove the customer typed that identifier. Images are looked up from Amazon catalog data.</p>
      <div className="adsw-table-toolbar">
          <div className="adsw-search-box">
            <span className="adsw-search-icon" aria-hidden="true">
              🔍
            </span>
            <input
              type="search"
              className="adsw-search-input"
              placeholder="Search buyer query, target or campaign..."
              value={query.search}
              onChange={e => onQueryChange({ search: e.target.value, page: 1 })}
            />
          </div>

          <div className="adsw-sort-controls">
            <label className="adsw-label" htmlFor="adsw-sort-terms">
              Sort by:
            </label>
            <select
              id="adsw-sort-terms"
              className="adsw-select"
              value={query.sort}
              onChange={e =>
                onQueryChange({
                  sort: e.target.value as AdvertisingViewQuery['sort'],
                  page: 1,
                })
              }
            >
              <option value="SPEND">Spend</option>
              <option value="SALES">Attributed Sales</option>
              <option value="ACOS">ACOS</option>
              <option value="ROAS">ROAS</option>
              <option value="PURCHASES">Purchases</option>
            </select>
            <button
              type="button"
              className="adsw-btn"
              style={{ minHeight: 36, padding: '4px 10px', fontSize: 12 }}
              onClick={() =>
                onQueryChange({
                  direction: query.direction === 'DESC' ? 'ASC' : 'DESC',
                  page: 1,
                })
              }
              aria-label={`Sort direction: ${query.direction === 'DESC' ? 'Descending' : 'Ascending'}`}
            >
              {query.direction === 'DESC' ? '↓ High to low' : '↑ Low to high'}
            </button>
          </div>
        </div>

        <div className="adsw-table-wrapper">
          <table className="adsw-table">
            <thead>
              <tr>
                <th>Customer Search Term</th>
                <th>Campaign / Ad Group</th>
                <th>Target &amp; Match</th>
                <th>Attribution Scope</th>
                <th className="is-numeric">Clicks</th>
                <th className="is-numeric">Spend</th>
                <th className="is-numeric">Orders</th>
                <th className="is-numeric">Attributed Sales</th>
                <th className="is-numeric">ACOS</th>
                <th className="is-numeric">ROAS</th>
                <th className="is-numeric">CPC</th>
                <th className="is-numeric">Conv. Rate</th><th>Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {searchTerms.length === 0 ? (
                <tr>
                  <td colSpan={13} style={{ textAlign: 'center', padding: 24 }}>
                    <p className="adsw-cell-sub">No search terms found matching current filters.</p>
                  </td>
                </tr>
              ) : (
                searchTerms.map(term => (
                  <tr key={term.entity.id}>
                    <td data-label="Customer Search Term">
                      <button
                        type="button"
                        className="adsw-entity-link"
                        aria-label={term.name}
                        onClick={() => onOpenEntity(term.entity)}
                      >
                        <AdsIdentity name={term.name} imageUrl={term.imageUrl} asin={term.imageAsin} />
                      </button>
                    </td>
                    <td data-label="Campaign / Ad Group">
                      <span>{term.subtitle || '—'}</span>
                    </td>
                    <td data-label="Target &amp; Match">
                      {term.target ? (
                        <span>
                          <strong>{term.target}</strong>
                          {term.matchType ? (
                            <span className="adsw-cell-sub">{term.matchType}</span>
                          ) : null}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td data-label="Attribution Scope">
                      <span className="adsw-badge-scope">
                        {term.attributionScope === 'DIRECT'
                          ? 'Direct SKU'
                          : term.attributionScope === 'SHARED_AD_GROUP'
                          ? 'Shared ad group'
                          : 'General'}
                      </span>
                    </td>
                    <td data-label="Clicks" className="is-numeric">{formatInteger(term.metrics.clicks)}</td>
                    <td data-label="Spend" className="is-numeric">{(term.metrics.spend === null ? '—' : formatMoney(term.metrics.spend))}</td>
                    <td data-label="Orders" className="is-numeric">{formatInteger(term.metrics.purchases)}</td>
                    <td data-label="Attributed Sales" className="is-numeric">{(term.metrics.attributedSales === null ? '—' : formatMoney(term.metrics.attributedSales))}</td>
                    <td data-label="ACOS" className="is-numeric">{formatPercent(term.metrics.acos)}</td>
                    <td data-label="ROAS" className="is-numeric">{formatMultiplier(term.metrics.roas)}</td>
                    <td data-label="CPC" className="is-numeric">{(term.metrics.cpc === null ? '—' : formatMoney(term.metrics.cpc))}</td>
                    <td data-label="Conv. Rate" className="is-numeric">{formatPercent(term.metrics.conversionRate)}</td>
                    <td data-label="Recommendation"><RecommendationNote value={term.recommendation} formatMoney={formatMoney} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="adsw-pagination">
          <span>
            Showing {searchTerms.length} of {totalRows} search terms
          </span>
          <div className="adsw-pagination-nav">
            <button
              type="button"
              className="adsw-btn"
              disabled={query.page <= 1}
              onClick={() => onQueryChange({ page: query.page - 1 })}
            >
              ← Previous
            </button>
            <span>
              Page {query.page} of {totalPages}
            </span>
            <button
              type="button"
              className="adsw-btn"
              disabled={query.page >= totalPages}
              onClick={() => onQueryChange({ page: query.page + 1 })}
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
