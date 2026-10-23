import { AdvertisingRecovery } from './AdvertisingRecovery'
import { buildSellerAdvertisingOverview } from '../core/advertising/sellerOverview'
import type { SponsoredProductsAttribution } from '../core/advertising/sponsoredProducts'
import { KpiCard } from './KpiCard'

type Props = { report: SponsoredProductsAttribution; postedGrossSales: number; formatMoney: (value: number) => string }
export function DashboardAdvertising({ report, postedGrossSales, formatMoney }: Props) {
  const metrics = buildSellerAdvertisingOverview(report, postedGrossSales)
  const pct = (value: number | null) => value === null ? '—' : `${value.toFixed(2)}%`
  if (report.status !== 'AVAILABLE') return <section className="seller-section ads-overview" aria-label="Advertising results"><div className="seller-section-heading"><h2>Advertising results</h2></div><AdvertisingRecovery report={report} /></section>
  return <section className="seller-section ads-overview" aria-label="Advertising results">
    <div className="seller-section-heading"><div><h2>Advertising results</h2></div><span className="seller-period">{report.selectedFrom} – {report.selectedTo}</span></div>
    <div className="kpi-grid seller-ads-grid">
      <KpiCard label="Ad spend" value={formatMoney(metrics.spend)} hint="Reported spend before GST" tone="accent" />
      <KpiCard label="Sales credited to ads" value={formatMoney(metrics.attributedSales)} hint="Attribution only; not added to business sales" />
      <KpiCard label="ACOS" value={pct(metrics.acos)} hint="Ad spend as a share of ad-attributed sales" unavailableReason={metrics.acos === null ? 'No positive ad-attributed sales in these dates' : undefined} />
      <KpiCard label="Ad ROAS" value={metrics.roas === null ? '—' : `${metrics.roas.toFixed(2)}×`} hint="Sales credited for each ₹1 of ad spend" unavailableReason={metrics.roas === null ? 'No positive ad spend in these dates' : undefined} />
      <KpiCard label="TACOS" value={pct(metrics.tacos)} hint="Ad spend as a share of total posted sales" unavailableReason={metrics.tacos === null ? 'No positive product sales in these dates' : undefined} />
      <KpiCard label="Ad-attributed orders" value={metrics.orders.toLocaleString('en-IN')} hint="Amazon’s seven-day click attribution" />
    </div>
    <details className="seller-disclosure"><summary>Details</summary><div className="seller-detail-grid"><div><span>Clicks</span><strong>{metrics.clicks.toLocaleString('en-IN')}</strong></div><div><span>Impressions</span><strong>{metrics.impressions.toLocaleString('en-IN')}</strong></div><div><span>Cost per click</span><strong>{metrics.cpc === null ? '—' : formatMoney(metrics.cpc)}</strong>{metrics.cpc === null ? <small className="metric-unavailable-reason">No ad clicks in these dates</small> : null}</div><div><span>Conversion rate</span><strong>{pct(metrics.conversionRate)}</strong>{metrics.conversionRate === null ? <small className="metric-unavailable-reason">No ad clicks in these dates</small> : null}</div></div><p>Business profit uses booked advertising expense from the financial report. Advertising performance uses reported spend before GST. These amounts may differ because of tax, billing dates and ad types. Sales attribution follows the ad-click date and may include purchases within seven days.</p><div className="seller-detail-grid"><div><span>Booked advertising expense</span><strong>{formatMoney(report.unifiedAdsCost)}</strong></div><div><span>Booked less reported spend</span><strong>{formatMoney(report.reconciliationDifference)}</strong></div><div><span>Unmatched advertising spend</span><strong>{formatMoney(report.unmatchedSpend)}</strong></div></div>{report.unmatched.length ? <details><summary>{report.unmatched.length} advertised products need matching</summary><div className="table-scroll"><table><thead><tr><th>SKU</th><th>Spend</th><th>Reason</th></tr></thead><tbody>{report.unmatched.map(item => <tr key={item.sku}><td>{item.sku}</td><td>{formatMoney(item.spend)}</td><td>{item.reason}</td></tr>)}</tbody></table></div></details> : null}</details>
  </section>
}
