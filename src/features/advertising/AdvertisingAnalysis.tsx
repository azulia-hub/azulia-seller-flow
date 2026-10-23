import { useMemo, useState } from 'react'
import { downloadCsv } from '../../adapters/browser/downloadCsv'
import { KpiCard } from '../../components/KpiCard'
import { PageHeader } from '../../components/PageHeader'
import { filterAdvertisingSkus, type AdvertisingSummary, type AdvertisingSkuFilterSpec, type AdvertisingTrendPoint } from '../../core/analytics/advertisingSummary'
import type { SponsoredProductsAttribution } from '../../core/advertising/sponsoredProducts'

type Props = {
  readonly onUseAdsReport: () => void
  readonly summary: AdvertisingSummary
  readonly sponsored: SponsoredProductsAttribution
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

export function AdvertisingAnalysis({ onUseAdsReport, summary, sponsored, formatMoney, fileName, accountTypes, fulfillmentTypes, accountType, fulfillmentType, onAccountTypeChange, onFulfillmentTypeChange, onSelectSku }: Props) {
  const [productScope, setProductScope] = useState('ADVERTISED')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<NonNullable<AdvertisingSkuFilterSpec['sort']>>('ADS_SPEND')
  const [direction, setDirection] = useState<NonNullable<AdvertisingSkuFilterSpec['direction']>>('DESC')
  const items = useMemo(() => filterAdvertisingSkus(summary.skus, { search, sort, direction, reportedAdsOnly: sponsored.status === 'AVAILABLE' && productScope === 'ADVERTISED' }), [summary.skus, search, sort, direction, sponsored.status, productScope])
  const exportRows = () => downloadCsv(`${fileName.replace(/\.[^.]+$/, '')}-advertising-by-sku.csv`, ['SKU', 'Gross sales', 'Direct ads', 'TACOS %', 'Sales per ad expense', 'Sales ratio basis', 'Attribution'], items.map((item) => [item.sku, item.grossSales, item.directAdsSpend, item.attribution === 'DIRECT' ? item.tacos : '', item.attribution === 'DIRECT' ? item.roas : '', item.attributionSource === 'REPORT' ? 'Ad-attributed sales / reported spend' : 'Total product sales / booked expense', item.attribution]))

  return <>
    <PageHeader eyebrow="Advertising analysis" title="Understand what advertising is costing you" description="Track advertising spend and sales ratios over time, then inspect how advertising spend relates to each SKU." action={<button className="secondary" disabled={!items.length} onClick={exportRows}>Export SKU analysis</button>} />
    {sponsored.reportFrom ? <p className="ads-report-coverage">Uploaded ads report: <strong>{sponsored.reportFrom} → {sponsored.reportTo}</strong>. Analysis dates: <strong>{sponsored.selectedFrom} → {sponsored.selectedTo}</strong>. <button className="secondary" onClick={onUseAdsReport}>Use ads report dates and clear dimension filters</button></p> : null}
    <section className="ad-dimension-filters" aria-label="Advertising dimensions">
      <div><strong>Advertising filters</strong><small>Applied to every metric, chart, and SKU below</small></div>
      <label>Account / payment type<select value={accountType} onChange={(event) => onAccountTypeChange(event.target.value)}><option value="">All account types</option>{accountTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Fulfillment type<select value={fulfillmentType} onChange={(event) => onFulfillmentTypeChange(event.target.value)}><option value="">All fulfillment types</option>{fulfillmentTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
      {accountType || fulfillmentType ? <button className="secondary" onClick={() => { onAccountTypeChange(''); onFulfillmentTypeChange('') }}>Clear</button> : null}
    </section>
    <aside className="ad-attribution-note"><span>i</span><div><strong>Advertising uses the selected posting period</strong><p>Financial sales and charges use posting dates even when the dashboard is in Sales-period view. Ads use report dates, with seven-day click attribution. Unified business totals remain unchanged.</p></div></aside>
    <>
      <section className="kpi-grid advertising-kpis">
        <KpiCard label="Booked ads expense" value={formatMoney(summary.adsSpend)} tone="accent" hint={`${summary.adEventCount.toLocaleString('en-IN')} advertising transactions`} />
        <KpiCard label="Booked TACOS" value={`${summary.tacos.toFixed(2)}%`} tone={summary.tacos > 20 ? 'negative' : 'accent'} hint="Ads spend ÷ gross sales" />
        <KpiCard label="Total sales / booked ad expense" value={`${summary.roas.toFixed(2)}×`} tone={summary.roas >= 4 ? 'positive' : 'neutral'} hint="Gross sales ÷ ads spend" />
        <KpiCard label="Gross sales" value={formatMoney(summary.grossSales)} tone="positive" hint="Sales in the active filters" />
        <KpiCard label="Booked SKU attribution" value={`${summary.attributionCoverage.toFixed(1)}%`} tone={summary.attributionCoverage ? 'positive' : 'neutral'} hint={`${formatMoney(summary.directAdsSpend)} carries a SKU`} />
        <KpiCard label="Unassigned booked ads" value={formatMoney(summary.unassignedAdsSpend)} tone={summary.unassignedAdsSpend ? 'neutral' : 'positive'} hint="Not distributed across products" />
      </section>
      {sponsored.status === 'AVAILABLE' ? <>
        <aside className="ad-attribution-note good"><span>✓</span><div><strong>Sponsored Products enrichment active for {sponsored.selectedFrom} → {sponsored.selectedTo}</strong><p>Reported product spend is unchanged. No automatic GST or proportional scaling. Click a SKU below for ACOS, contribution, unit costs and source evidence.</p></div></aside>
        <section className="kpi-grid advertising-kpis">
          <KpiCard label="Reported ads before GST" value={formatMoney(sponsored.reportSpendExcludingTax)} hint="Sponsored Products only" />
          <KpiCard label="Ad-attributed sales" value={formatMoney(sponsored.performance.attributedSales)} hint="Same SKU plus cross-sell; not added to financial sales" />
          <KpiCard label="Matched product spend" value={formatMoney(sponsored.matchedSpend)} hint="Joined by SKU" />
          <KpiCard label="Unmatched product spend" value={formatMoney(sponsored.unmatchedSpend)} hint="Identity requires review" />
          <KpiCard label="Booked less reported spend" value={formatMoney(sponsored.reconciliationDifference)} hint="A source difference, not a GST calculation; may include tax, timing and other ad types" />
        </section>
        <p>Business profit uses Unified’s booked advertising expense. Profit after ads uses reported Sponsored Products spend before advertising GST. Advertising GST and unassigned account expenses are excluded from profit after ads; source taxes, other charges and product costs retain their existing treatment. These results are not fully GST-exclusive or final business net profit.</p>
        {sponsored.unmatched.length ? <details><summary>Review {sponsored.unmatched.length} unmatched advertised SKUs</summary><div className="table-scroll"><table><thead><tr><th>Advertised SKU</th><th>Reported spend</th><th>Reason</th></tr></thead><tbody>{sponsored.unmatched.map(item => <tr key={item.sku}><td>{item.sku}</td><td>{formatMoney(item.spend)}</td><td>{item.reason}</td></tr>)}</tbody></table></div></details> : null}
      </> : <aside className="ad-attribution-note"><span>i</span><div><strong>{sponsored.status === 'OUTSIDE_COVERAGE' ? 'Ads report does not cover the selected dates' : sponsored.status === 'UNSUPPORTED_FILTER' ? 'Advertising enrichment does not support these dimension filters' : 'Import a Sponsored Products report'}</strong><p>{sponsored.status === 'OUTSIDE_COVERAGE' ? `Selected: ${sponsored.selectedFrom} → ${sponsored.selectedTo}; ads report: ${sponsored.reportFrom} → ${sponsored.reportTo}. Choose a covered period.` : sponsored.status === 'UNSUPPORTED_FILTER' ? 'Clear global fulfillment and advertising account/fulfillment filters. Ads rows do not identify those dimensions.' : 'Upload an Advertised product XLSX under Reports.'}</p></div></aside>}
      {sponsored.accountCharges.length ? <details><summary>Remaining charges and adjustments without a product match ({sponsored.accountCharges.length})</summary><p>These have no identifiable product link in the selected activity and remain outside profit after ads. Some may require missing order history.</p><div className="table-scroll"><table><thead><tr><th>Source label</th><th>Signed amount</th><th>Classification</th></tr></thead><tbody>{sponsored.accountCharges.map((item, index) => <tr key={index}><td>{item.label}</td><td>{formatMoney(item.amount)}</td><td>{item.classified ? 'Classified' : 'Needs review'}</td></tr>)}</tbody></table></div></details> : null}
      <AdvertisingTrend data={summary.trend} formatMoney={formatMoney} />
      <section className="panel ad-sku-panel" aria-label="Advertising performance by product">
        <div className="panel-head"><div><small>SKU attribution</small><h3>Advertising performance by product</h3><p>Click a SKU for ACOS, ad spend, contribution after ads, per-unit costs, campaigns and orders. Matched ads-report spend is before GST; booked-only amounts retain their source tax treatment.</p></div><span className="status warning">{items.length.toLocaleString('en-IN')} SKUs</span></div>
        {sponsored.status === 'AVAILABLE' ? <p>{sponsored.skus.length} financial SKUs matched to the ads report; {sponsored.unmatched.length} advertised SKUs need matching in the review above. Only products with ads rows are shown by default.</p> : <p role="status">{sponsored.status === 'OUTSIDE_COVERAGE' ? 'Product advertising is paused because the selected dates are not covered by the uploaded ads report. Use the ads report dates above.' : sponsored.status === 'UNSUPPORTED_FILTER' ? 'Product advertising is paused by account or fulfillment filters. Clear those filters using the button above.' : 'Upload a Sponsored Products report to connect product advertising. The rows below contain only booked financial evidence.'}</p>}
        <div className="product-controls">
          {sponsored.status === 'AVAILABLE' ? <label>Products shown<select aria-label="Advertising product scope" value={productScope} onChange={event => setProductScope(event.target.value)}><option value="ADVERTISED">Products matched to ads report</option><option value="ALL">All financial products</option></select></label> : null}
          <input aria-label="Search SKU" placeholder="Search SKU" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select aria-label="Sort advertising SKUs" value={sort} onChange={(event) => setSort(event.target.value as NonNullable<AdvertisingSkuFilterSpec['sort']>)}><option value="ADS_SPEND">Sort by ad spend</option><option value="TACOS">Sort by TACOS</option><option value="ROAS">Sort by sales / ad expense</option><option value="GROSS_SALES">Sort by gross sales</option></select>
          <button className="secondary" onClick={() => setDirection((value) => value === 'DESC' ? 'ASC' : 'DESC')}>{direction === 'DESC' ? 'Highest first' : 'Lowest first'}</button>
        </div>
        <div className="table-scroll"><table className="ad-sku-table"><thead><tr><th>SKU</th><th>Gross sales</th><th>Product ad spend</th><th>TACOS</th><th>Sales per ₹1 of ads</th><th>Attribution</th></tr></thead><tbody>
          {items.map((item) => <tr key={item.sku} onClick={() => onSelectSku(item.sku)}><td><button className="sku-link">{item.sku}</button></td><td>{formatMoney(item.grossSales)}</td><td>{item.attribution === 'DIRECT' ? formatMoney(item.directAdsSpend) : '—'}</td><td className={item.attribution === 'DIRECT' && item.tacos > 20 ? 'bad-text' : 'good-text'}>{item.attribution === 'DIRECT' && item.grossSales > 0 ? `${item.tacos.toFixed(2)}%` : item.attribution === 'DIRECT' ? 'No financial sales' : '—'}</td><td>{item.attribution === 'DIRECT' && item.directAdsSpend > 0 ? `${item.roas.toFixed(2)}×` : item.attribution === 'DIRECT' ? 'No ad spend' : '—'}<small className="cell-sub">{item.attributionSource === 'REPORT' ? 'Ad-attributed sales / reported spend' : 'Total product sales / booked expense'}</small></td><td><span className={`pill ${item.attribution === 'DIRECT' ? 'good' : 'warn'}`}>{item.attributionSource === 'REPORT' ? 'Ads report matched' : item.attribution === 'DIRECT' ? 'Booked SKU charge only' : sponsored.status === 'AVAILABLE' ? 'No ads rows in selected period' : sponsored.status === 'OUTSIDE_COVERAGE' ? 'Select covered dates' : sponsored.status === 'UNSUPPORTED_FILTER' ? 'Clear dimension filters' : 'Ads report required'}</span></td></tr>)}
          {!items.length ? <tr><td colSpan={6} className="empty-state">No products match this search or product scope. Try All financial products, or review unmatched advertised SKUs above.</td></tr> : null}
        </tbody></table></div>
      </section>
    </>
  </>
}
