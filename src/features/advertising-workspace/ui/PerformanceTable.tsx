import type { AdvertisingPerformanceTotals } from '../../../core/advertising/workspace'
import { Fragment, useId, useState } from 'react'
import type { AdvertisingEntity, AdvertisingEntityRow, AdvertisingSortQuery } from '../contract'
import { AdsIdentity } from './AdsIdentity'
import { RecommendationNote } from './RecommendationNote'
import { formatChange, formatInteger, formatMultiplier, formatPercent } from './formatters'

interface PerformanceTableProps {
  readonly rows: readonly AdvertisingEntityRow[]
  readonly kind: 'campaign' | 'searchTerm' | 'product'
  readonly label?: string
  readonly totals?: { readonly label: string; readonly metrics: AdvertisingPerformanceTotals }
  readonly sorting?: {
    readonly query: AdvertisingSortQuery
    readonly onQueryChange: (patch: AdvertisingSortQuery & { page: number }) => void
  }
  readonly formatMoney: (value: number) => string
  readonly onOpenEntity: (entity: AdvertisingEntity) => void
}

export function CampaignStatus({ status }: { status: string | null }) {
  return <span className={`adsw-badge-status ${status === 'ENABLED' ? 'is-enabled' : status === 'PAUSED' ? 'is-paused' : ''}`}>{status || 'UNKNOWN'}</span>
}

const sortableMetrics = [
  ['SPEND', 'Spend'],
  ['SALES', 'Attributed Sales'],
  ['ACOS', 'ACOS'],
  ['PURCHASES', 'Purchases'],
] as const

function MetricHeader({ metric, label, sorting }: {
  metric: typeof sortableMetrics[number][0]
  label: string
  sorting: PerformanceTableProps['sorting']
}) {
  if (!sorting) return <th scope="col" className="is-numeric">{label}</th>
  const { query, onQueryChange } = sorting
  const selected = query.sortSelected ?? (query.sort !== 'SPEND' || query.direction !== 'DESC')
  const direction = selected && query.sort === metric ? query.direction : null
  const next = direction === 'DESC'
    ? { sort: 'SPEND', direction: 'DESC', sortSelected: false, page: 1 } as const
    : { sort: metric, direction: direction === 'ASC' ? 'DESC' : 'ASC', sortSelected: true, page: 1 } as const
  const action = direction === 'DESC' ? 'Restore default order' : direction === 'ASC' ? 'Sort descending' : 'Sort ascending'
  return <th scope="col" className="is-numeric adsw-sortable-header" aria-sort={direction === 'ASC' ? 'ascending' : direction === 'DESC' ? 'descending' : undefined}>
    <button type="button" className="adsw-column-sort" aria-label={`${label}, ${action.toLowerCase()}`} title={action} onClick={() => onQueryChange(next)}>
      {label} <span aria-hidden="true">{direction === 'ASC' ? '↑' : direction === 'DESC' ? '↓' : '↕'}</span>
    </button>
  </th>
}

/** The same compact evidence table serves campaign previews, campaigns and terms. */
export function PerformanceTable({ rows, kind, label, formatMoney, onOpenEntity, sorting, totals }: PerformanceTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  return <div className="adsw-table-wrapper">
    <table className={`adsw-table adsw-performance-table${sorting ? " adsw-sortable-table" : ""}`} aria-label={label ?? (kind === 'campaign' ? 'Campaign performance' : kind === 'product' ? 'Product performance' : 'Search term performance')}>
      <thead><tr><th>{kind === 'campaign' ? 'Campaign' : kind === 'product' ? 'Product / SKU' : 'Customer Search Term'}</th>{sortableMetrics.map(([metric, name]) => <MetricHeader key={metric} metric={metric} label={name} sorting={sorting} />)}<th>Review</th><th><span className="adsw-visually-hidden">More metrics</span></th></tr>
      {totals ? <tr className="adsw-performance-totals">
        <th scope="row">{totals.label}</th>
        <td className="is-numeric">{totals.metrics.spend === null ? '—' : formatMoney(totals.metrics.spend)}</td>
        <td className="is-numeric">{totals.metrics.attributedSales === null ? '—' : formatMoney(totals.metrics.attributedSales)}</td>
        <td className="is-numeric">{formatPercent(totals.metrics.acos)}</td>
        <td className="is-numeric">{formatInteger(totals.metrics.purchases)}</td>
        <td colSpan={2} className="adsw-total-spacer" />
      </tr> : null}
      </thead>
      <tbody>{rows.length ? rows.map(row => <PerformanceRow key={row.entity.id} row={row} kind={kind} formatMoney={formatMoney} onOpenEntity={onOpenEntity} expanded={expandedId === row.entity.id} onToggle={() => setExpandedId(expandedId === row.entity.id ? null : row.entity.id)} />) : <tr className="adsw-performance-empty"><td colSpan={7}>No {kind === 'campaign' ? 'campaigns' : kind === 'product' ? 'products' : 'search terms'} found matching current filters.</td></tr>}</tbody>
    </table>
  </div>
}

function PerformanceRow({ row, kind, formatMoney, onOpenEntity, expanded, onToggle }: {
  row: AdvertisingEntityRow; kind: PerformanceTableProps['kind']; formatMoney: PerformanceTableProps['formatMoney']; onOpenEntity: PerformanceTableProps['onOpenEntity']; expanded: boolean; onToggle: () => void
}) {
  const panelId = useId(), metrics = row.metrics
  const money = (value: number | null) => value === null ? '—' : formatMoney(value)
  const recommendation = row.recommendation
  return <Fragment>
    <tr className={`adsw-performance-row${expanded ? ' is-expanded' : ''}`}>
      <td className="adsw-performance-identity" data-label={kind === 'campaign' ? 'Campaign' : kind === 'product' ? 'Product / SKU' : 'Customer Search Term'}>
        <div className="adsw-performance-name"><button type="button" className="adsw-entity-link" aria-label={row.name} onClick={() => onOpenEntity(row.entity)}><AdsIdentity name={row.name} imageUrl={row.imageUrl} asin={row.imageAsin} /></button>{kind === 'campaign' ? <CampaignStatus status={row.status} /> : null}</div>
        {row.negativeMatches?.length ? <span className="adsw-badge-status is-negative">Negative</span> : null}
        {row.subtitle ? <span className="adsw-performance-context" title={row.subtitle}>{row.subtitle}</span> : null}
      </td>
      <td className="is-numeric adsw-primary-metric" data-label="Spend">{money(metrics.spend)}</td>
      <td className="is-numeric adsw-primary-metric" data-label="Attributed Sales">{money(metrics.attributedSales)}</td>
      <td className="is-numeric adsw-primary-metric" data-label="ACOS">{formatPercent(metrics.acos)}</td>
      <td className="is-numeric adsw-purchases" data-label="Purchases">{formatInteger(metrics.purchases)}</td>
      <td className="adsw-performance-review" data-label="Review">
        <span className={`adsw-review-summary adsw-recommendation-${recommendation?.action.toLowerCase() ?? 'hold'}`} title={recommendation?.text ?? row.note}><strong>{recommendation?.text ?? row.note ?? 'No review available'}</strong></span>
        {recommendation?.suggestedBid !== null && recommendation?.suggestedBid !== undefined ? <small className="adsw-cell-sub">Test bid: {formatMoney(recommendation.suggestedBid)}</small> : null}
      </td>
      <td className="adsw-performance-actions"><button type="button" className="adsw-btn adsw-btn-ghost" aria-expanded={expanded} aria-controls={panelId} aria-label={`${expanded ? 'Hide' : 'More'} metrics for ${row.name}`} onClick={onToggle}>{expanded ? 'Less −' : 'More +'}</button></td>
    </tr>
    {expanded ? <tr className="adsw-performance-details"><td colSpan={7}>
      <section id={panelId} aria-label={`More metrics for ${row.name}`}>
        <dl className="adsw-secondary-metrics">
          {kind === 'product' ? <div><dt>Status</dt><dd>{row.status ?? 'Not supplied'}</dd></div> : null}
          <div><dt>Clicks</dt><dd>{formatInteger(metrics.clicks)}</dd></div><div><dt>CPC</dt><dd>{money(metrics.cpc)}</dd></div><div><dt>ROAS</dt><dd>{formatMultiplier(metrics.roas)}</dd></div><div><dt>Conversion rate</dt><dd>{formatPercent(metrics.conversionRate)}</dd></div>
          {row.change ? <div><dt>Change</dt><dd className={row.change.favorable === true ? 'is-favorable' : row.change.favorable === false ? 'is-unfavorable' : ''}>{formatChange(row.change)}</dd></div> : null}
        </dl>
        {row.subtitle ? <p className="adsw-expanded-context">{row.subtitle}</p> : null}
        {kind === 'searchTerm' ? <dl className="adsw-term-context"><div><dt>Target &amp; Match</dt><dd>{row.target || 'Unavailable'}{row.matchType ? ` · ${row.matchType}` : ''}</dd></div><div><dt>Attribution Scope</dt><dd>{row.attributionScope === 'DIRECT' ? 'Direct SKU' : row.attributionScope === 'SHARED_AD_GROUP' ? 'Shared ad group' : 'Unavailable'}</dd></div></dl> : null}
        {row.negativeMatches?.length ? <dl className="adsw-term-context">
          {row.negativeMatches.map(match => <div key={JSON.stringify([match.scope, match.type, match.value])}>
            <dt>{match.scope} negative · {match.type}</dt>
            <dd>{match.value} · Synced {new Date(match.observedAt).toLocaleDateString()}</dd>
          </div>)}
        </dl> : null}
        {recommendation ? <RecommendationNote value={recommendation} formatMoney={formatMoney} /> : row.note ? <p className="adsw-expanded-context">{row.note}</p> : null}
        <button type="button" className="adsw-btn" onClick={() => onOpenEntity(row.entity)}>Open full investigation →</button>
      </section>
    </td></tr> : null}
  </Fragment>
}
