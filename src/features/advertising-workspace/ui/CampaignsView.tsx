import type {
  AdvertisingEntity,
  AdvertisingViewQuery,
  AdvertisingWorkspaceModel,
} from '../contract'
import {
  formatChange,
  formatInteger,
  formatMultiplier,
  formatPercent,
} from './formatters'

interface CampaignsViewProps {
  readonly model: AdvertisingWorkspaceModel
  readonly formatMoney: (n: number) => string
  readonly onOpenEntity: (entity: AdvertisingEntity) => void
  readonly onQueryChange: (patch: Partial<AdvertisingViewQuery>) => void
}

export function CampaignsView({
  model,
  formatMoney,
  onOpenEntity,
  onQueryChange,
}: CampaignsViewProps) {
  const { query, campaigns, totalRows, pageSize } = model
  const totalPages = Math.max(1, Math.ceil(totalRows / Math.max(1, pageSize)))

  return (
    <div className="adsw-table-card" aria-label="Campaigns table">
      <div className="adsw-table-toolbar">
        <div className="adsw-search-box">
          <span className="adsw-search-icon" aria-hidden="true">
            🔍
          </span>
          <input
            type="search"
            className="adsw-search-input"
            placeholder="Search campaigns..."
            value={query.search}
            onChange={e => onQueryChange({ search: e.target.value, page: 1 })}
          />
        </div>

        <div className="adsw-sort-controls">
          <label className="adsw-label" htmlFor="adsw-sort-campaigns">
            Sort by:
          </label>
          <select
            id="adsw-sort-campaigns"
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
              <th>Campaign</th>
              <th>Status</th>
              <th className="is-numeric">Spend</th>
              <th className="is-numeric">Attributed Sales</th>
              <th className="is-numeric">Purchases</th>
              <th className="is-numeric">ACOS</th>
              <th className="is-numeric">ROAS</th>
              <th className="is-numeric">CPC</th>
              <th className="is-numeric">Clicks</th>
              <th>Change</th>
              <th>Review note</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ textAlign: 'center', padding: 24 }}>
                  <p className="adsw-cell-sub">No campaigns found matching current filters.</p>
                </td>
              </tr>
            ) : (
              campaigns.map(camp => (
                <tr key={camp.entity.id}>
                  <td data-label="Campaign">
                    <button
                      type="button"
                      className="adsw-entity-link"
                      onClick={() => onOpenEntity(camp.entity)}
                    >
                      {camp.name}
                    </button>
                    {camp.subtitle ? (
                      <span className="adsw-cell-sub">{camp.subtitle}</span>
                    ) : null}
                  </td>
                  <td data-label="Status">
                    <span
                      className={`adsw-badge-status ${
                        camp.status === 'ENABLED'
                          ? 'is-enabled'
                          : camp.status === 'PAUSED'
                          ? 'is-paused'
                          : ''
                      }`}
                    >
                      {camp.status || 'UNKNOWN'}
                    </span>
                  </td>
                  <td data-label="Spend" className="is-numeric">{(camp.metrics.spend === null ? '—' : formatMoney(camp.metrics.spend))}</td>
                  <td data-label="Attributed Sales" className="is-numeric">{(camp.metrics.attributedSales === null ? '—' : formatMoney(camp.metrics.attributedSales))}</td>
                  <td data-label="Purchases" className="is-numeric">{formatInteger(camp.metrics.purchases)}</td>
                  <td data-label="ACOS" className="is-numeric">{formatPercent(camp.metrics.acos)}</td>
                  <td data-label="ROAS" className="is-numeric">{formatMultiplier(camp.metrics.roas)}</td>
                  <td data-label="CPC" className="is-numeric">{(camp.metrics.cpc === null ? '—' : formatMoney(camp.metrics.cpc))}</td>
                  <td data-label="Clicks" className="is-numeric">{formatInteger(camp.metrics.clicks)}</td>
                  <td data-label="Change">
                    {camp.change ? (
                      <span
                        className={`adsw-metric-change ${
                          camp.change.favorable === true
                            ? 'is-favorable'
                            : camp.change.favorable === false
                            ? 'is-unfavorable'
                            : ''
                        }`}
                      >
                        {formatChange(camp.change)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td data-label="Review note">
                    {camp.note ? (
                      <span className="adsw-cell-sub">{camp.note}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="adsw-pagination">
        <span>
          Showing {campaigns.length} of {totalRows} campaigns
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
  )
}
