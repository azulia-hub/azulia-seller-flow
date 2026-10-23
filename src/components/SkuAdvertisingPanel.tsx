import { ContentSection } from './ContentSection'
import { AdvertisingRecovery } from './AdvertisingRecovery'
import type { SkuProfitSummary } from '../core/analytics/orderProfit'
import { buildSkuAdvertisingEconomics, type SponsoredProductsAttribution } from '../core/advertising/sponsoredProducts'
import { downloadCsv } from '../adapters/browser/downloadCsv'

export function SkuAdvertisingPanel({ product, sku, sponsored }: { product?: SkuProfitSummary; sku?: string; sponsored: SponsoredProductsAttribution; formatMoney?: (value: number) => string }) {
  const ads = sponsored.skus.find(item => item.sku === (product?.sku ?? sku))
  const preciseMoney = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const money = (value: number | null) => value === null ? 'Unavailable' : preciseMoney.format(value)
  const pct = (value: number | null) => value === null ? 'Unavailable' : `${value.toFixed(2)}%`
  if (!ads) return <section className="panel sku-ad-economics"><h3>Product advertising</h3>{sponsored.status !== 'AVAILABLE' ? <AdvertisingRecovery report={sponsored} /> : <p>Product SKU not matched to advertising rows in these dates. Review unmatched products under Advertising results → Details on the dashboard.</p>}</section>
  const economics = product ? buildSkuAdvertisingEconomics(product, ads) : null
  const cards: [string, string][] = [
    ['Total product sales before separately reported sales GST', money(product?.grossSales ?? null)],
    ['Reported ad spend before GST', money(ads.spend)], ['Sales credited to ads (7-day)', money(ads.attributedSales)],
    ['Same-SKU attributed sales', money(ads.sameSkuSales)], ['Other-SKU attributed sales', money(ads.otherSkuSales)],
    ['ACOS', pct(ads.acos)], ['Ad ROAS', ads.roas === null ? 'Unavailable' : `${ads.roas.toFixed(2)}×`], ['TACOS', pct(ads.tacos)],
    ['Profit after ads', money(economics?.contributionAfterReportedAds ?? null)],
    ['Ads cost per sold unit', money(economics?.costPerSoldUnit ?? null)], ['Ads cost per retained unit', money(economics?.costPerRetainedUnit ?? null)],
    ['Cost per attributed order', money(ads.costPerAttributedOrder)], ['CPC', money(ads.cpc)], ['CTR', pct(ads.ctr)],
    ['Ad conversion rate', pct(ads.conversionRate)], ['Impressions', ads.impressions.toLocaleString('en-IN')], ['Clicks', ads.clicks.toLocaleString('en-IN')],
    ['Attributed orders', ads.orders.toLocaleString('en-IN')], ['Attributed units', ads.units.toLocaleString('en-IN')],
  ]
  const unavailableReasons: Record<string, string> = {
    ACOS: 'No positive ad-attributed sales in these dates',
    'Ad ROAS': 'No positive ad spend in these dates',
    TACOS: 'No positive product sales in these dates',
    'Profit after ads': product ? 'Add product cost to see profit after ads' : 'No financial product activity in these dates',
    'Ads cost per sold unit': 'No sold units in these dates',
    'Ads cost per retained unit': 'No retained units in these dates',
    'Cost per attributed order': 'No orders credited to ads in these dates',
    CPC: 'No ad clicks in these dates', CTR: 'No ad impressions in these dates',
    'Ad conversion rate': 'No ad clicks in these dates',
  }
  const unavailableReason = (label: string, value: string) => value === 'Unavailable' ? <small className="metric-unavailable-reason">{unavailableReasons[label] ?? 'No evidence for this metric in these dates'}</small> : null
  const exportEvidence = () => downloadCsv(`${ads.sku}-advertising-evidence.csv`, ['Section', 'Metric', 'Value', 'Basis'], [
    ...cards.map(([label, value]) => ['Metric', label, value, 'Transactions by posting date / ad-click dates']),
    ...Object.entries(ads).filter(([, value]) => typeof value === 'number').map(([key, value]) => ['Source aggregate', key, value as number, 'Unrounded metric / reported total']),
    ...(economics?.bridge ?? []).map(row => ['Contribution bridge', row.label, row.amount ?? '', 'Selected posting period']),
    ...ads.daily.map(row => ['Daily spend', row.date, row.spend, 'Before GST']),
    ...ads.campaigns.map(row => ['Campaign spend', `${row.campaign} / ${row.adGroup}`, row.spend, 'Before GST']),
    ['Context', 'Selected range', `${sponsored.selectedFrom} to ${sponsored.selectedTo}`, ''],
    ['Context', 'Contribution exclusions', 'Advertising GST; unassigned account expenses; advertising outside the uploaded Sponsored Products report', 'Other source taxes, charges and product costs retain existing treatment'],
    ['Context', 'Business profit basis', 'Unified booked advertising expense; Sponsored Products spend is not deducted again', 'Business financial totals unchanged'],
    ['Context', 'Contribution formula', 'Unified SKU operating result + booked SKU ads - net COGS - reported Sponsored Products spend', 'Not fully GST-exclusive or final business net profit'],
  ])
  return <section className="panel sku-ad-economics" aria-label="Product advertising economics">
    <div className="panel-head"><div><small>{ads.asin || ads.sku}</small><h3>Advertising &amp; profit</h3><small>Transactions by posting date · {sponsored.selectedFrom} – {sponsored.selectedTo}</small></div><button className="secondary" onClick={exportEvidence}>Export advertising evidence</button></div>
    <div className="sku-metric-grid seller-product-ads">{[cards[1], cards[5], cards[8], cards[9], cards[6], cards[7]].map(([label, value]) => <article className="sku-mini-metric" key={label}><span title={label}>{label === 'Reported ad spend before GST' ? 'Ad spend (excl. GST)' : label === 'Profit after ads' ? 'Profit after ads' : label === 'Ads cost per sold unit' ? 'Ad cost / unit' : label}</span><strong>{value === 'Unavailable' ? '—' : value}</strong>{unavailableReason(label, value)}</article>)}</div>
    {product?.missingCost ? <p role="status">Add product cost to see profit after ads.</p> : null}
    {!product ? <p role="status">No financial product activity in these posting dates. Ad performance remains available; profit after ads needs matching financial activity.</p> : null}
    <p className="seller-footnote">Profit after product costs, marketplace charges and reported ads. Excludes advertising GST and shared business expenses.</p>
    <ContentSection title="Advertising metrics"><div className="sku-metric-grid">{cards.filter((_, index) => ![1,5,8,9,6,7].includes(index)).map(([label, value]) => <article className="sku-mini-metric" key={label}><span>{label}</span><strong>{value === 'Unavailable' ? '—' : value}</strong>{unavailableReason(label, value)}</article>)}</div><p>ACOS = spend ÷ ad-attributed sales × 100. ROAS = ad-attributed sales ÷ spend. Both include cross-sell and use spend before GST. Seven-day attribution means purchases credited within seven days of an ad click; it is not the selected report period.</p><p>Profit after ads restores any booked product advertising, deducts net product cost and reported advertising once. Other source taxes and charges keep their existing treatment. This is not final business net profit. Business profit continues to use booked advertising expense from the financial report.</p></ContentSection>
    <ContentSection title="How profit after ads is calculated"><div className="table-scroll"><table><thead><tr><th>Component</th><th>Amount</th></tr></thead><tbody>{(economics?.bridge ?? []).map(row => <tr key={row.label}><td>{row.label.replace('Product contribution after reported ads', 'Profit after ads')}</td><td>{money(row.amount)}</td></tr>)}</tbody></table></div></ContentSection>
    <ContentSection title="Campaign and ad-group breakdown"><div className="table-scroll"><table><thead><tr><th>Campaign</th><th>Ad group</th><th>Spend before GST</th><th>Attributed sales</th><th>ACOS</th></tr></thead><tbody>{ads.campaigns.map(row => <tr key={JSON.stringify([row.campaign,row.adGroup])}><td>{row.campaign || 'Not supplied'}</td><td>{row.adGroup || 'Not supplied'}</td><td>{money(row.spend)}</td><td>{money(row.attributedSales)}</td><td>{pct(row.acos)}</td></tr>)}</tbody></table></div></ContentSection>
    <ContentSection title="Daily breakdown"><div className="table-scroll"><table><thead><tr><th>Date</th><th>Spend before GST</th><th>Attributed sales</th><th>Clicks</th><th>ACOS</th></tr></thead><tbody>{ads.daily.map(row => <tr key={row.date}><td>{row.date}</td><td>{money(row.spend)}</td><td>{money(row.attributedSales)}</td><td>{row.clicks}</td><td>{pct(row.acos)}</td></tr>)}</tbody></table></div></ContentSection>
  </section>
}
