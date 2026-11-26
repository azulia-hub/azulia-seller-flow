import { CopyValue } from '../../../components/CopyValue'
import { summarizeAdvertisingPerformance } from '../../../core/advertising/workspace'
import { selectSearchTermRows } from '../searchTermRows'
import { SearchTermsControls } from './SearchTermsView'
import { PerformanceTable } from './PerformanceTable'
import { useVisibleAdsAsins } from './VisibleAsins'
import { DetailPagination, useDetailPage } from './DetailPagination'
import { AdsIdentity } from './AdsIdentity'
import { RecommendationNote } from './RecommendationNote'
import { useMemo, useState } from 'react'
import { sortPerformanceRows } from '../sortPerformanceRows'
import { useDialogFocus } from './useDialogFocus'
import type {
  AdvertisingCrossSale,
  AdvertisingDetailModel,
  AdvertisingEntity,
  AdvertisingEntityRow,
  AdvertisingSortQuery,
  AdvertisingTargetRow,
  SearchTermQuery,
} from '../contract'
import { SummaryCards } from './SummaryCards'
import { TrendChart } from './TrendChart'
import {
  formatInteger,
  formatMultiplier,
  formatPercent,
} from './formatters'

interface EntityDetailViewProps {
  readonly detail: AdvertisingDetailModel
  readonly formatMoney: (n: number) => string
  readonly onCloseDetail: () => void
  readonly onOpenEntity: (entity: AdvertisingEntity) => void
  readonly onOpenFinancialProduct: (productId: string) => void
}

type DetailSection = 'summary' | 'campaigns' | 'products' | 'searchTerms' | 'targets' | 'crossSales'

const SECTION_LABELS: Record<DetailSection, string> = {
  summary: 'Summary & Trend',
  campaigns: 'Campaigns',
  products: 'Products',
  searchTerms: 'Search Terms',
  targets: 'Targets & Bids',
  crossSales: 'Cross-Sales',
}

export function EntityDetailView({
  detail,
  formatMoney,
  onCloseDetail,
  onOpenEntity,
  onOpenFinancialProduct,
}: EntityDetailViewProps) {
  const sections = detail.availableSections as readonly DetailSection[]
  const dialog = useDialogFocus(true, onCloseDetail)
  const [activeSection, setActiveSection] = useState<DetailSection>(sections[0] ?? 'summary')

  const currentSection = sections.includes(activeSection) ? activeSection : sections[0] ?? 'summary'

  return (
    <div
      className="adsw-modal-scrim"
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={`Detail: ${detail.title}`}
    >
      <div className="adsw-detail-drawer" data-testid="entity-detail-drawer">
        <header className="adsw-detail-header">
          <div className="adsw-detail-title-group">
            <span className="adsw-detail-kind">{detail.entity.kind}</span>
            <h2 className="adsw-detail-title"><AdsIdentity name={detail.title} imageUrl={detail.imageUrl} asin={detail.imageAsin} /></h2><details className="adsw-full-title"><summary>Full name</summary>{detail.title}</details>
            {detail.imageAsin ? <CopyValue label="ASIN" value={detail.imageAsin} /> : null}
            {detail.subtitle ? (
              <p className="adsw-detail-subtitle">{detail.subtitle}</p>
            ) : null}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {detail.entity.kind === 'PRODUCT' ? (
              <button
                type="button"
                className="adsw-btn"
                onClick={() => onOpenFinancialProduct(detail.entity.id)}
              >
                Financial Profile ↗
              </button>
            ) : null}
            <button
              type="button"
              className="adsw-btn"
              onClick={onCloseDetail}
              aria-label="Back to workspace"
            >
              ← Back
            </button>
          </div>
        </header>

        <div className="adsw-detail-body">
          {detail.summary && detail.summary.length > 0 ? (
            <SummaryCards metrics={detail.summary} formatMoney={formatMoney} />
          ) : null}

          {detail.notices && detail.notices.length > 0 ? (
            <div className="adsw-banner adsw-banner-partial">
              <ul className="adsw-notices-list">
                {detail.notices.map((notice, i) => (
                  <li key={i} className="adsw-notice-item">
                    {notice}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Detail Navigation Tabs */}
          {sections.length > 1 ? (
            <div className="adsw-detail-nav" role="tablist" aria-label="Detail sections">
              {sections.map(sec => (
                <button
                  key={sec}
                  type="button"
                  role="tab"
                  aria-selected={currentSection === sec}
                  className={`adsw-detail-nav-btn ${currentSection === sec ? 'is-active' : ''}`}
                  onClick={() => setActiveSection(sec)}
                >
                  {SECTION_LABELS[sec]}
                </button>
              ))}
            </div>
          ) : null}

          {/* Active Section Content */}
          {currentSection === 'summary' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {detail.trend && detail.trend.length > 0 ? (
                <TrendChart trend={detail.trend} formatMoney={formatMoney} />
              ) : null}

              <div className="adsw-findings-card">
                <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>Metrics Breakdown</h3>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: 10,
                  }}
                >
                  <div className="adsw-field">
                    <span className="adsw-label">Spend</span>
                    <strong>{(detail.metrics.spend === null ? '—' : formatMoney(detail.metrics.spend))}</strong>
                  </div>
                  <div className="adsw-field">
                    <span className="adsw-label">Attributed Sales</span>
                    <strong>{(detail.metrics.attributedSales === null ? '—' : formatMoney(detail.metrics.attributedSales))}</strong>
                  </div>
                  <div className="adsw-field">
                    <span className="adsw-label">ACOS</span>
                    <strong>{formatPercent(detail.metrics.acos)}</strong>
                  </div>
                  <div className="adsw-field">
                    <span className="adsw-label">ROAS</span>
                    <strong>{formatMultiplier(detail.metrics.roas)}</strong>
                  </div>
                  <div className="adsw-field">
                    <span className="adsw-label">Clicks</span>
                    <strong>{formatInteger(detail.metrics.clicks)}</strong>
                  </div>
                  <div className="adsw-field">
                    <span className="adsw-label">Impressions</span>
                    <strong>{formatInteger(detail.metrics.impressions)}</strong>
                  </div>
                  <div className="adsw-field">
                    <span className="adsw-label">CPC</span>
                    <strong>{(detail.metrics.cpc === null ? '—' : formatMoney(detail.metrics.cpc))}</strong>
                  </div>
                  <div className="adsw-field">
                    <span className="adsw-label">CTR</span>
                    <strong>{formatPercent(detail.metrics.ctr)}</strong>
                  </div>
                  <div className="adsw-field">
                    <span className="adsw-label">Orders</span>
                    <strong>{formatInteger(detail.metrics.purchases)}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentSection === 'campaigns' && (
            <DetailEntityTable
              title="Related Campaigns"
              key="campaign"
              kind="campaign"
              rows={detail.campaigns}
              formatMoney={formatMoney}
              onOpenEntity={onOpenEntity}
            />
          )}

          {currentSection === 'products' && (
            <DetailEntityTable
              title="Related Products"
              key="product"
              kind="product"
              rows={detail.products}
              formatMoney={formatMoney}
              onOpenEntity={onOpenEntity}
            />
          )}

          {currentSection === 'searchTerms' && (
            <DetailSearchTerms
              rows={detail.searchTerms}
              moneyDecimals={detail.searchTermMoneyDecimals ?? 2}
              formatMoney={formatMoney}
              onOpenEntity={onOpenEntity}
            />
          )}

          {currentSection === 'targets' && (
            <DetailTargetsTable targets={detail.targets} formatMoney={formatMoney} />
          )}

          {currentSection === 'crossSales' && (
            <DetailCrossSalesSection crossSales={detail.crossSales} formatMoney={formatMoney} />
          )}
        </div>
      </div>
    </div>
  )
}

function DetailEntityTable({
  title,
  kind,
  rows,
  formatMoney,
  onOpenEntity,
}: {
  readonly title: string
  readonly kind: 'campaign' | 'product'
  readonly rows: readonly AdvertisingEntityRow[]
  readonly formatMoney: (n: number) => string
  readonly onOpenEntity: (entity: AdvertisingEntity) => void
}) {
  const [sorting, setSorting] = useState<AdvertisingSortQuery>({ sort: 'SPEND', direction: 'DESC', sortSelected: false })
  const sortedRows = useMemo(() => sorting.sortSelected ? sortPerformanceRows(rows, sorting) : rows, [rows, sorting])
  const pagination = useDetailPage(sortedRows)
  useVisibleAdsAsins(pagination.rows.map(item => item.imageAsin))
  if (!rows || rows.length === 0) {
    return <p className="adsw-cell-sub">No {title.toLowerCase()} recorded for this entity.</p>
  }

  return (
    <div className="adsw-table-card">
      <PerformanceTable rows={pagination.rows} kind={kind} label={title} sorting={{
        query: sorting,
        onQueryChange: ({ page, ...next }) => { setSorting(next); pagination.setPage(page) },
      }} formatMoney={formatMoney} onOpenEntity={onOpenEntity} />
      <DetailPagination {...pagination} />
    </div>
  )
}

function DetailSearchTerms({ rows, moneyDecimals, formatMoney, onOpenEntity }: {
  readonly rows: readonly AdvertisingEntityRow[]
  readonly moneyDecimals: number
  readonly formatMoney: (amount: number) => string
  readonly onOpenEntity: (entity: AdvertisingEntity) => void
}) {
  const [query, setQuery] = useState<SearchTermQuery>({ search: '', sort: 'SPEND', direction: 'DESC', sortSelected: false })
  const filtered = Boolean(query.search.trim())
  const selected = useMemo(() => {
    const matching = filtered || query.sortSelected ? selectSearchTermRows(rows, query) : rows
    return { rows: matching, metrics: summarizeAdvertisingPerformance(matching.map(row => row.metrics), moneyDecimals) }
  }, [rows, query, filtered, moneyDecimals])
  const pagination = useDetailPage(selected.rows)
  useVisibleAdsAsins(pagination.rows.map(row => row.imageAsin))

  function onQueryChange({ page, ...patch }: Partial<SearchTermQuery> & { page: number }) {
    setQuery(current => ({ ...current, ...patch }))
    pagination.setPage(page)
  }

  return <div className="adsw-table-card">
    <SearchTermsControls query={query} onQueryChange={onQueryChange} />
    <PerformanceTable rows={pagination.rows} kind="searchTerm" label="Customer Search Terms"
      sorting={{ query, onQueryChange }} formatMoney={formatMoney} onOpenEntity={onOpenEntity}
      totals={{ metrics: selected.metrics, label: filtered ? 'Matching terms total' : 'All search terms total' }} />
    <DetailPagination {...pagination} />
  </div>
}

function DetailTargetsTable({
  targets,
  formatMoney,
}: {
  readonly targets: readonly AdvertisingTargetRow[]
  readonly formatMoney: (n: number) => string
}) {
  const pagination = useDetailPage(targets)
  useVisibleAdsAsins(pagination.rows.map(item => item.imageAsin))
  if (!targets || targets.length === 0) {
    return <p className="adsw-cell-sub">No targets or bids supplied for this entity.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p className="adsw-cell-sub" style={{ margin: 0 }}>
        Configured bid reflects current entity configuration, not historical bid at time of click.
      </p>
      <div className="adsw-table-card">
        <div className="adsw-table-wrapper">
          <table className="adsw-table" aria-label="Targets and bids">
            <thead>
              <tr>
                <th>Target</th>
                <th>Match Type</th>
                <th>Status</th>
                <th className="is-numeric">Configured Bid</th>
                <th>Bid Source</th>
                <th className="is-numeric">Spend</th>
                <th className="is-numeric">Attributed Sales</th>
                <th className="is-numeric">Clicks</th><th>Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {pagination.rows.map(t => (
                <tr key={t.id}>
                  <td data-label="Target">
                    <AdsIdentity name={t.name} imageUrl={t.imageUrl} asin={t.imageAsin} />
                    {t.observedAt ? (
                      <span className="adsw-cell-sub">Observed: {t.observedAt}</span>
                    ) : null}
                  </td>
                  <td data-label="Match Type">{t.matchType || '—'}</td>
                  <td data-label="Status">
                    <span
                      className={`adsw-badge-status ${
                        t.status === 'ENABLED'
                          ? 'is-enabled'
                          : t.status === 'PAUSED'
                          ? 'is-paused'
                          : ''
                      }`}
                    >
                      {t.status || 'Not supplied'}{t.effectiveStatus && t.effectiveStatus !== t.status ? <small className="adsw-cell-sub">{t.effectiveStatus}</small> : null}
                    </span>
                  </td>
                  <td data-label="Configured Bid" className="is-numeric">
                    {t.configuredBid !== null ? formatMoney(t.configuredBid) : '—'}
                  </td>
                  <td data-label="Bid Source">
                    <span className="adsw-bid-badge">
                      {t.bidSource === 'TARGET'
                        ? 'Target bid'
                        : t.bidSource === 'AD_GROUP_DEFAULT'
                        ? 'Default ad group bid'
                        : 'Unknown'}
                    </span>
                  </td>
                  <td data-label="Spend" className="is-numeric">
                    {t.metrics ? (t.metrics.spend === null ? '—' : formatMoney(t.metrics.spend)) : '—'}
                  </td>
                  <td data-label="Attributed Sales" className="is-numeric">
                    {t.metrics ? (t.metrics.attributedSales === null ? '—' : formatMoney(t.metrics.attributedSales)) : '—'}
                  </td>
                  <td data-label="Clicks" className="is-numeric">
                    {t.metrics ? formatInteger(t.metrics.clicks) : '—'}
                  </td><td data-label="Recommendation"><RecommendationNote value={t.recommendation} formatMoney={formatMoney} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <DetailPagination {...pagination} />
    </div>
  )
}

function DetailCrossSalesSection({
  crossSales,
  formatMoney,
}: {
  readonly crossSales: readonly AdvertisingCrossSale[]
  readonly formatMoney: (n: number) => string
}) {
  const pagination = useDetailPage(crossSales)
  useVisibleAdsAsins(pagination.rows.flatMap(item => [item.advertisedAsin, item.purchasedAsin]))
  if (!crossSales || crossSales.length === 0) {
    return <p className="adsw-cell-sub">No cross-sales evidence recorded for this entity.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="adsw-cell-sub" style={{ margin: 0 }}>
        Aggregate Amazon attribution from 7-day click window, not individual clickstream.
      </p>
      <div className="adsw-cross-sales-list">
        {pagination.rows.map(cs => {
          const relLabel =
            cs.relationship === 'SAME_PRODUCT'
              ? 'Same product'
              : cs.relationship === 'SIBLING'
              ? 'In selected group'
              : cs.relationship === 'OUTSIDE_GROUP'
              ? 'Outside group'
              : 'Unknown product'

          return (
            <div key={cs.id} className="adsw-cross-sale-card">
              <div className="adsw-flow-row">
                <AdsIdentity name={cs.advertisedProduct} imageUrl={cs.advertisedImageUrl} asin={cs.advertisedAsin} />
                <span className="adsw-flow-arrow">→</span>
                <AdsIdentity name={cs.purchasedProduct || 'Unmapped product'} imageUrl={cs.purchasedImageUrl} asin={cs.purchasedAsin} />
                <span className="adsw-rel-badge">{relLabel}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  color: 'var(--muted, #716c60)',
                }}
              >
                <span>
                  Attributed Sales: <strong>{(cs.attributedSales === null ? '—' : formatMoney(cs.attributedSales))}</strong>
                </span>
                <span>
                  Units: <strong>{formatInteger(cs.units)}</strong>
                </span>
              </div>
              {cs.evidence ? (
                <div className="adsw-cell-sub">{cs.evidence}</div>
              ) : null}
            </div>
          )
        })}
      </div>
      <DetailPagination {...pagination} />
    </div>
  )
}
