import type {
  AdvertisingEntity,
  AdvertisingWorkspaceModel,
  AdvertisingViewQuery,
} from '../contract'
import { SummaryCards } from './SummaryCards'
import { FindingsSection } from './FindingsSection'
import { TrendChart } from './TrendChart'
import {
  formatInteger,
  formatMultiplier,
  formatPercent,
  formatChange,
} from './formatters'

interface OverviewViewProps {
  readonly model: AdvertisingWorkspaceModel
  readonly formatMoney: (n: number) => string
  readonly onOpenEntity: (entity: AdvertisingEntity) => void
  readonly onQueryChange: (patch: Partial<AdvertisingViewQuery>) => void
}

export function OverviewView({
  model,
  formatMoney,
  onOpenEntity,
  onQueryChange,
}: OverviewViewProps) {
  const topCampaigns = model.campaigns.slice(0, 5)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 5 Primary Summary Measures */}
      <SummaryCards metrics={model.summary} formatMoney={formatMoney} />

      {/* Up to 3 Needs Review Findings */}
      <FindingsSection findings={model.findings} onOpenEntity={onOpenEntity} />

      {/* Daily Performance Trend */}
      <TrendChart trend={model.trend} formatMoney={formatMoney} />

      {/* Top Campaigns Preview */}
      {topCampaigns.length > 0 ? (
        <section className="adsw-table-card" aria-label="Top campaigns preview">
          <div className="adsw-table-toolbar">
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Top campaigns</h3>
            <button
              type="button"
              className="adsw-btn adsw-btn-ghost"
              onClick={() => onQueryChange({ view: 'campaigns', page: 1 })}
            >
              View all campaigns ({model.campaigns.length}) →
            </button>
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
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {topCampaigns.map(camp => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
