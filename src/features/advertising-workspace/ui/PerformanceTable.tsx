import { Fragment, useId, useState } from 'react'
import type { AdvertisingEntity, AdvertisingEntityRow } from '../contract'
import { AdsIdentity } from './AdsIdentity'
import { RecommendationNote } from './RecommendationNote'
import { formatChange, formatInteger, formatMultiplier, formatPercent } from './formatters'

interface PerformanceTableProps {
  readonly rows: readonly AdvertisingEntityRow[]
  readonly kind: 'campaign' | 'searchTerm' | 'product'
  readonly label?: string
  readonly formatMoney: (value: number) => string
  readonly onOpenEntity: (entity: AdvertisingEntity) => void
}

export function CampaignStatus({ status }: { status: string | null }) {
  return <span className={`adsw-badge-status ${status === 'ENABLED' ? 'is-enabled' : status === 'PAUSED' ? 'is-paused' : ''}`}>{status || 'UNKNOWN'}</span>
}

/** The same compact evidence table serves campaign previews, campaigns and terms. */
export function PerformanceTable({ rows, kind, label, formatMoney, onOpenEntity }: PerformanceTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  return <div className="adsw-table-wrapper">
    <table className="adsw-table adsw-performance-table" aria-label={label ?? (kind === 'campaign' ? 'Campaign performance' : kind === 'product' ? 'Product performance' : 'Search term performance')}>
      <thead><tr><th>{kind === 'campaign' ? 'Campaign' : kind === 'product' ? 'Product / SKU' : 'Customer Search Term'}</th><th className="is-numeric">Spend</th><th className="is-numeric">Attributed Sales</th><th className="is-numeric">ACOS</th><th className="is-numeric">Purchases</th><th>Review</th><th><span className="adsw-visually-hidden">More metrics</span></th></tr></thead>
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
        {recommendation ? <RecommendationNote value={recommendation} formatMoney={formatMoney} /> : row.note ? <p className="adsw-expanded-context">{row.note}</p> : null}
        <button type="button" className="adsw-btn" onClick={() => onOpenEntity(row.entity)}>Open full investigation →</button>
      </section>
    </td></tr> : null}
  </Fragment>
}
