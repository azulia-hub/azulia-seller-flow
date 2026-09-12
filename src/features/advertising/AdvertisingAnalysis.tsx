import { useMemo, useState } from 'react'
import { downloadCsv } from '../../adapters/browser/downloadCsv'
import { KpiCard } from '../../components/KpiCard'
import { PageHeader } from '../../components/PageHeader'
import { filterAdvertisingSkus, type AdvertisingSummary, type AdvertisingSkuFilterSpec, type AdvertisingTrendPoint } from '../../core/analytics/advertisingSummary'

type Props = {
  readonly summary: AdvertisingSummary
  readonly formatMoney: (value: number) => string
  readonly fileName: string
  readonly accountTypes: readonly string[]
  readonly fulfillmentTypes: readonly string[]
  readonly accountType: string
  readonly fulfillmentType: string
  readonly onAccountTypeChange: (value: string) => void
  readonly onFulfillmentTypeChange: (value: string) => void
  readonly onSelectSku: (sku: string) => void
}

function AdvertisingTrend({ data, formatMoney }: { readonly data: readonly AdvertisingTrendPoint[]; readonly formatMoney: (value: number) => string }) {
  const maxMoney = Math.max(1, ...data.flatMap((item) => [item.grossSales, item.adsSpend]))
  const maxTacos = Math.max(1, ...data.map((item) => item.tacos))
  const points = (pick: (item: AdvertisingTrendPoint) => number, max: number) => data.map((item, index) => `${data.length === 1 ? 50 : index / (data.length - 1) * 100},${94 - pick(item) / max * 84}`).join(' ')
  const ticks = data.length <= 5 ? data : data.filter((_, index) => index === 0 || index === data.length - 1 || index % Math.ceil(data.length / 4) === 0)
  return <section className="chart-shell ad-trend">
    <div className="chart-head"><div><small>Daily advertising trend</small><h3>Sales, spend and TACOS</h3></div><div className="ad-legend"><span className="sales">Sales</span><span className="spend">Ads</span><span className="tacos">TACOS</span></div></div>
    {!data.length ? <p className="empty-state">No dated advertising activity in this selection.</p> : <>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Daily gross sales, advertising spend and TACOS trend">
        {[10, 31, 52, 73, 94].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} />)}
        <polyline className="ad-sales-line" points={points((item) => item.grossSales, maxMoney)} />
        <polyline className="ad-spend-line" points={points((item) => item.adsSpend, maxMoney)} />
        <polyline className="ad-tacos-line" points={points((item) => item.tacos, maxTacos)} />
      </svg>
      <div className="ad-axis">{ticks.map((item) => <span key={item.date}>{item.date.slice(5)}</span>)}</div>
      <div className="ad-trend-footer"><span>Peak scale {formatMoney(maxMoney)}</span><span>Peak TACOS {maxTacos.toFixed(1)}%</span></div>
    </>}
  </section>
}

export function AdvertisingAnalysis({ summary, formatMoney, fileName, accountTypes, fulfillmentTypes, accountType, fulfillmentType, onAccountTypeChange, onFulfillmentTypeChange, onSelectSku }: Props) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<NonNullable<AdvertisingSkuFilterSpec['sort']>>('ADS_SPEND')
  const [direction, setDirection] = useState<NonNullable<AdvertisingSkuFilterSpec['direction']>>('DESC')
  const items = useMemo(() => filterAdvertisingSkus(summary.skus, { search, sort, direction }), [summary.skus, search, sort, direction])
  const exportRows = () => downloadCsv(`${fileName.replace(/\.[^.]+$/, '')}-advertising-by-sku.csv`, ['SKU', 'Gross sales', 'Direct ads', 'TACOS %', 'ROAS', 'Attribution'], items.map((item) => [item.sku, item.grossSales, item.directAdsSpend, item.attribution === 'DIRECT' ? item.tacos : '', item.attribution === 'DIRECT' ? item.roas : '', item.attribution]))

  return <>
    <PageHeader eyebrow="Advertising analysis" title="Understand what advertising is costing you" description="Track TACOS and ROAS over time, then inspect how advertising spend relates to each SKU." action={<button className="secondary" disabled={!items.length} onClick={exportRows}>Export SKU analysis</button>} />
    <section className="ad-dimension-filters" aria-label="Advertising dimensions">
      <div><strong>Advertising filters</strong><small>Applied to every metric, chart, and SKU below</small></div>
      <label>Account / payment type<select value={accountType} onChange={(event) => onAccountTypeChange(event.target.value)}><option value="">All account types</option>{accountTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Fulfillment type<select value={fulfillmentType} onChange={(event) => onFulfillmentTypeChange(event.target.value)}><option value="">All fulfillment types</option>{fulfillmentTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
      {accountType || fulfillmentType ? <button className="secondary" onClick={() => { onAccountTypeChange(''); onFulfillmentTypeChange('') }}>Clear</button> : null}
    </section>
    {!summary.adEventCount ? <section className="welcome-empty compact"><div className="welcome-illustration">◎</div><h2>No advertising charges found</h2><p>The current report or filter selection has no transactions classified as advertising. Review unfamiliar transaction types under Reports if you expect ad spend.</p></section> : <>
      <section className="kpi-grid advertising-kpis">
        <KpiCard label="Ads spend" value={formatMoney(summary.adsSpend)} tone="accent" hint={`${summary.adEventCount.toLocaleString('en-IN')} advertising transactions`} />
        <KpiCard label="TACOS" value={`${summary.tacos.toFixed(2)}%`} tone={summary.tacos > 20 ? 'negative' : 'accent'} hint="Ads spend ÷ gross sales" />
        <KpiCard label="ROAS" value={`${summary.roas.toFixed(2)}×`} tone={summary.roas >= 4 ? 'positive' : 'neutral'} hint="Gross sales ÷ ads spend" />
        <KpiCard label="Gross sales" value={formatMoney(summary.grossSales)} tone="positive" hint="Sales in the active filters" />
        <KpiCard label="Direct attribution" value={`${summary.attributionCoverage.toFixed(1)}%`} tone={summary.attributionCoverage ? 'positive' : 'neutral'} hint={`${formatMoney(summary.directAdsSpend)} carries a SKU`} />
        <KpiCard label="Unassigned spend" value={formatMoney(summary.unassignedAdsSpend)} tone={summary.unassignedAdsSpend ? 'neutral' : 'positive'} hint="Not distributed across products" />
      </section>
      <aside className="ad-attribution-note"><span>i</span><div><strong>SKU advertising requires source evidence</strong><p>Only advertising transactions that explicitly carry a SKU are attributed to that product. All other spend remains unassigned. Upload an Amazon Ads report in a future connected workflow to calculate reliable SKU TACOS and ROAS.</p></div></aside>
      <AdvertisingTrend data={summary.trend} formatMoney={formatMoney} />
      <section className="panel ad-sku-panel">
        <div className="panel-head"><div><small>SKU attribution</small><h3>Advertising performance by product</h3><p>Click a SKU to inspect its underlying orders.</p></div><span className="status warning">{items.length.toLocaleString('en-IN')} SKUs</span></div>
        <div className="product-controls">
          <input aria-label="Search SKU" placeholder="Search SKU" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select aria-label="Sort advertising SKUs" value={sort} onChange={(event) => setSort(event.target.value as NonNullable<AdvertisingSkuFilterSpec['sort']>)}><option value="ADS_SPEND">Sort by ad spend</option><option value="TACOS">Sort by TACOS</option><option value="ROAS">Sort by ROAS</option><option value="GROSS_SALES">Sort by gross sales</option></select>
          <button className="secondary" onClick={() => setDirection((value) => value === 'DESC' ? 'ASC' : 'DESC')}>{direction === 'DESC' ? 'Highest first' : 'Lowest first'}</button>
        </div>
        <div className="table-scroll"><table className="ad-sku-table"><thead><tr><th>SKU</th><th>Gross sales</th><th>Direct ads</th><th>TACOS</th><th>ROAS</th><th>Attribution</th></tr></thead><tbody>
          {items.map((item) => <tr key={item.sku} onClick={() => onSelectSku(item.sku)}><td><button className="sku-link">{item.sku}</button></td><td>{formatMoney(item.grossSales)}</td><td>{item.attribution === 'DIRECT' ? formatMoney(item.directAdsSpend) : '—'}</td><td className={item.attribution === 'DIRECT' && item.tacos > 20 ? 'bad-text' : 'good-text'}>{item.attribution === 'DIRECT' ? `${item.tacos.toFixed(2)}%` : 'Unavailable'}</td><td>{item.attribution === 'DIRECT' ? `${item.roas.toFixed(2)}×` : 'Unavailable'}</td><td><span className={`pill ${item.attribution === 'DIRECT' ? 'good' : 'warn'}`}>{item.attribution === 'DIRECT' ? 'Direct' : 'No SKU ad data'}</span></td></tr>)}
          {!items.length ? <tr><td colSpan={6} className="empty-state">No SKU matches this search.</td></tr> : null}
        </tbody></table></div>
      </section>
    </>}
  </>
}
