import type {
  AdvertisingEntity,
  AdvertisingWorkspaceModel,
  AdvertisingViewQuery,
} from '../contract'
import { SummaryCards } from './SummaryCards'
import { FindingsSection } from './FindingsSection'
import { TrendChart } from './TrendChart'
import { PerformanceTable } from './PerformanceTable'

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
              View all campaigns →
            </button>
          </div>
          <PerformanceTable rows={topCampaigns} kind="campaign" sorting={{ query: model.query, onQueryChange }} formatMoney={formatMoney} onOpenEntity={onOpenEntity} />
        </section>
      ) : null}
    </div>
  )
}
