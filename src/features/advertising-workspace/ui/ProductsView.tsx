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

interface ProductsViewProps {
  readonly model: AdvertisingWorkspaceModel
  readonly formatMoney: (n: number) => string
  readonly onOpenEntity: (entity: AdvertisingEntity) => void
  readonly onOpenFinancialProduct: (productId: string) => void
  readonly onQueryChange: (patch: Partial<AdvertisingViewQuery>) => void
}

export function ProductsView({
  model,
  formatMoney,
  onOpenEntity,
  onOpenFinancialProduct,
  onQueryChange,
}: ProductsViewProps) {
  const { query, products, totalRows, pageSize } = model
  const totalPages = Math.max(1, Math.ceil(totalRows / Math.max(1, pageSize)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="adsw-banner adsw-banner-partial" style={{ fontSize: 12 }}>
        <strong>Product join policy:</strong> Total product sales uses verified financial orders
        (excluding GST) within the date window; Reported ad spend is before GST. TACOS and profit
        after ads appear only when both sides have verified coverage.
      </div>

      <div className="adsw-table-card" aria-label="Products advertising table">
        <div className="adsw-table-toolbar">
          <div className="adsw-search-box">
            <span className="adsw-search-icon" aria-hidden="true">
              🔍
            </span>
            <input
              type="search"
              className="adsw-search-input"
              placeholder="Search products by SKU or title..."
              value={query.search}
              onChange={e => onQueryChange({ search: e.target.value, page: 1 })}
            />
          </div>

          <div className="adsw-sort-controls">
            <label className="adsw-label" htmlFor="adsw-sort-products">
              Sort by:
            </label>
            <select
              id="adsw-sort-products"
              className="adsw-select"
              value={query.sort}
              onChange={e =>
                onQueryChange({
                  sort: e.target.value as AdvertisingViewQuery['sort'],
                  page: 1,
                })
              }
            >
              <option value="SPEND">Reported Spend</option>
              <option value="SALES">Attributed Sales</option>
              <option value="ACOS">ACOS</option>
              <option value="ROAS">ROAS</option>
              <option value="PURCHASES">Orders</option>
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
                <th>Product / SKU</th>
                <th className="is-numeric">Reported Spend</th>
                <th className="is-numeric">Total Sales</th>
                <th className="is-numeric">Attributed Sales</th>
                <th className="is-numeric">TACOS</th>
                <th className="is-numeric">ROAS</th>
                <th className="is-numeric">ACOS</th>
                <th className="is-numeric">Profit after Ads</th>
                <th className="is-numeric">Campaigns</th>
                <th>Recommendation</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: 24 }}>
                    <p className="adsw-cell-sub">No products found matching current filters.</p>
                  </td>
                </tr>
              ) : (
                products.map(prod => (
                  <tr key={prod.entity.id}>
                    <td data-label="Product / SKU">
                      <button
                        type="button"
                        className="adsw-entity-link"
                        aria-label={prod.name}
                        onClick={() => onOpenEntity(prod.entity)}
                      >
                        <AdsIdentity name={prod.name} imageUrl={prod.imageUrl} asin={prod.imageAsin} />
                      </button>
                      {prod.subtitle ? (
                        <span className="adsw-cell-sub">{prod.subtitle}</span>
                      ) : null}
                    </td>
                    <td data-label="Reported Spend" className="is-numeric">{(prod.metrics.spend === null ? '—' : formatMoney(prod.metrics.spend))}</td>
                    <td data-label="Total Sales" className="is-numeric">
                      {prod.metrics.totalProductSales !== null
                        ? formatMoney(prod.metrics.totalProductSales)
                        : '—'}
                    </td>
                    <td data-label="Attributed Sales" className="is-numeric">{(prod.metrics.attributedSales === null ? '—' : formatMoney(prod.metrics.attributedSales))}</td>
                    <td data-label="TACOS" className="is-numeric">{formatPercent(prod.metrics.tacos)}</td>
                    <td data-label="ROAS" className="is-numeric">{formatMultiplier(prod.metrics.roas)}</td>
                    <td data-label="ACOS" className="is-numeric">{formatPercent(prod.metrics.acos)}</td>
                    <td data-label="Profit after Ads" className="is-numeric">
                      {prod.metrics.profitAfterAds !== null
                        ? formatMoney(prod.metrics.profitAfterAds)
                        : '—'}
                    </td>
                    <td data-label="Campaigns" className="is-numeric">
                      {prod.relatedCampaigns !== undefined
                        ? formatInteger(prod.relatedCampaigns)
                        : '—'}
                    </td>
                    <td data-label="Recommendation"><RecommendationNote value={prod.recommendation} formatMoney={formatMoney} /></td>
                    <td data-label="Actions">
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="adsw-btn adsw-btn-ghost"
                          style={{ padding: '2px 6px', fontSize: 11 }}
                          onClick={() => onOpenEntity(prod.entity)}
                        >
                          Ads detail
                        </button>
                        <button
                          type="button"
                          className="adsw-btn adsw-btn-ghost"
                          style={{ padding: '2px 6px', fontSize: 11 }}
                          onClick={() => onOpenFinancialProduct(prod.entity.id)}
                        >
                          Catalog ↗
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="adsw-pagination">
          <span>
            Showing {products.length} of {totalRows} products
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
