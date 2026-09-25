import { useMemo, useState } from 'react'
import { filterProductProfitability, type ProductProfitabilityFilterSpec, type SkuProfitSummary } from '../../core/analytics/orderProfit'
import { downloadCsv } from '../../adapters/browser/downloadCsv'

interface Portfolio {
  readonly skuCount: number
  readonly profitableSkuCount: number
  readonly lossMakingSkuCount: number
  readonly missingCostSkuCount: number
  readonly grossSales: number
  readonly profit: number
  readonly netCogs: number
  readonly assignedAdvertising: number
  readonly unassignedAdvertising: number
  readonly unassignedOperating: number
  readonly portfolioProfit: number
  readonly topProfitSkus: readonly SkuProfitSummary[]
  readonly lossSkus: readonly SkuProfitSummary[]
}

interface Props {
  readonly items: readonly SkuProfitSummary[]
  readonly portfolio: Portfolio
  readonly formatMoney: (value: number) => string
  readonly fileName: string
  readonly onManageCosts: () => void
  readonly onSelectSku: (sku: string) => void
}

function ProfitRanking({ title, items, formatMoney, onSelectSku }: { title: string; items: readonly SkuProfitSummary[]; formatMoney: (value: number) => string; onSelectSku: (sku: string) => void }) {
  const max = Math.max(1, ...items.map((item) => Math.abs(item.profit)))
  return <div className="product-ranking"><h4>{title}</h4>{!items.length ? <p className="empty-state">No products in this category.</p> : items.map((item) => <button key={item.sku} onClick={() => onSelectSku(item.sku)}><span>{item.sku}</span><i><b className={item.profit >= 0 ? 'positive' : 'negative'} style={{ width: `${Math.abs(item.profit) / max * 100}%` }} /></i><strong className={item.profit >= 0 ? 'good-text' : 'bad-text'}>{formatMoney(item.profit)}</strong></button>)}</div>
}

export function ProductProfitability({ items, portfolio, formatMoney, fileName, onManageCosts, onSelectSku }: Props) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<NonNullable<ProductProfitabilityFilterSpec['status']>>('ALL')
  const [minimumSales, setMinimumSales] = useState(0)
  const [sort, setSort] = useState<NonNullable<ProductProfitabilityFilterSpec['sort']>>('PROFIT')
  const [direction, setDirection] = useState<NonNullable<ProductProfitabilityFilterSpec['direction']>>('DESC')
  const filtered = useMemo(() => filterProductProfitability(items, { search, status, minimumSales, sort, direction }), [items, search, status, minimumSales, sort, direction])
  return <>
    <section className="product-hero"><div><span className="eyebrow">Products</span><h1>See which products create profit—not just sales</h1><p>Compare product sales, returns, marketplace charges, shipping, product cost, and real profit in one place.</p></div><button className="secondary" onClick={onManageCosts}>Manage product costs</button></section>
    <section className="product-kpis">{[
      ['positive', 'Portfolio profit', formatMoney(portfolio.portfolioProfit), `Includes ${formatMoney(portfolio.unassignedOperating)} unassigned operating activity`],
      ['accent', 'Gross sales', formatMoney(portfolio.grossSales), `${portfolio.skuCount} selling SKUs`],
      ['positive', 'Profitable SKUs', portfolio.profitableSkuCount, 'With complete cost data'],
      ['negative', 'Loss-making SKUs', portfolio.lossMakingSkuCount, 'With complete cost data'],
      ['warning', 'Missing costs', portfolio.missingCostSkuCount, 'Profit remains estimated'],
      ['neutral', 'Net COGS', formatMoney(portfolio.netCogs), 'Good returns reverse COGS'],
    ].map(([kind, label, value, note]) => <article className={String(kind)} key={String(label)}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}</section>
    {portfolio.unassignedAdvertising || portfolio.unassignedOperating ? <section className="product-attribution-note"><strong>Unassigned activity remains visible</strong><span>{formatMoney(portfolio.unassignedAdvertising)} advertising and {formatMoney(portfolio.unassignedOperating)} total operating activity have no safely attributable SKU. They are included in portfolio profit, but not silently spread across products.</span></section> : null}
    <section className="product-ranking-grid panel"><div className="panel-head"><div><small>Profit ranking</small><h3>Best and weakest products</h3><p>Click any SKU to open its metrics, daily trend, cost bridge, and orders.</p></div></div><div><ProfitRanking title="Highest profit" items={portfolio.topProfitSkus} formatMoney={formatMoney} onSelectSku={onSelectSku} /><ProfitRanking title="Loss-making" items={portfolio.lossSkus} formatMoney={formatMoney} onSelectSku={onSelectSku} /></div></section>
    <section className="panel table-panel product-profit-table"><div className="panel-head"><div><small>SKU unit economics</small><h3>Product profitability table</h3><p>Use filters to isolate weak margins, missing costs, or high-return products.</p></div><button className="text-btn" onClick={() => downloadCsv(`${fileName}-product-profitability.csv`, ['SKU','Gross sales','Net revenue','Sold','Returned','Return rate %','ASP','Marketplace charges','Shipping','Assigned ads','Net COGS','Profit','Profit per delivered unit','Margin %','ROI %','Break-even TACOS %','Cost status'], filtered.map((item) => [item.sku,item.grossSales,item.netProductRevenue,item.soldQuantity,item.returnQuantity,item.returnRate,item.averageSellingPrice,item.marketplaceCharges,item.shippingFees,item.advertising,item.netCogs,item.profit,item.profitPerDeliveredUnit,item.profitMargin,item.roi,item.breakEvenTacos,item.missingCost ? 'Missing' : 'Covered']))}>Export CSV</button></div>
      <div className="product-controls"><input placeholder="Search by SKU" aria-label="Search SKU" value={search} onChange={(event) => setSearch(event.target.value)} /><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="ALL">All products</option><option value="PROFITABLE">Profitable</option><option value="LOSS_MAKING">Loss-making</option><option value="MISSING_COST">Missing product cost</option></select><label>Minimum sales<input type="number" min="0" value={minimumSales} onChange={(event) => setMinimumSales(Number(event.target.value))} /></label><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="PROFIT">Sort by profit</option><option value="GROSS_SALES">Sort by sales</option><option value="MARGIN">Sort by margin</option><option value="ROI">Sort by ROI</option><option value="RETURN_RATE">Sort by return rate</option><option value="NET_COGS">Sort by product cost</option><option value="PROFIT_PER_UNIT">Sort by profit / delivered unit</option><option value="BREAK_EVEN_TACOS">Sort by break-even TACOS</option></select><button className="secondary" onClick={() => setDirection((value) => value === 'DESC' ? 'ASC' : 'DESC')}>{direction === 'DESC' ? 'High → low' : 'Low → high'}</button><button className="secondary" onClick={onManageCosts}>Manage product costs</button></div>
      <div className="table-scroll"><table><thead><tr><th>SKU</th><th>Cost status</th><th>Gross sales</th><th>Net revenue</th><th>Sold / returned</th><th>Return rate</th><th>ASP</th><th>Marketplace</th><th>Shipping</th><th>Assigned ads</th><th>Net COGS</th><th>Profit</th><th>Profit / delivered unit</th><th>Margin</th><th>ROI</th><th>Break-even TACOS</th></tr></thead><tbody>{!filtered.length ? <tr><td colSpan={16}>No products match these filters.</td></tr> : filtered.map((item) => <tr key={item.sku}><td><button className="sku-drill-link" onClick={() => onSelectSku(item.sku)}>{item.sku}</button></td><td>{item.missingCost ? <span className="pill warn">Missing</span> : <span className="pill good">Covered</span>}</td><td>{formatMoney(item.grossSales)}</td><td>{formatMoney(item.netProductRevenue)}</td><td>{item.soldQuantity} / {item.returnQuantity}</td><td><span className={`rate-badge ${item.returnRate >= 20 ? 'high' : item.returnRate >= 10 ? 'medium' : 'low'}`}>{item.returnRate.toFixed(1)}%</span></td><td>{formatMoney(item.averageSellingPrice)}</td><td>{formatMoney(item.marketplaceCharges)}</td><td>{formatMoney(item.shippingFees)}</td><td>{formatMoney(item.advertising)}</td><td>{formatMoney(item.netCogs)}</td><td className={item.profit >= 0 ? 'good-text' : 'bad-text'}><strong>{formatMoney(item.profit)}</strong></td><td>{item.netDeliveredQuantity > 0 && !item.missingCost ? formatMoney(item.profitPerDeliveredUnit) : 'Unavailable'}</td><td>{item.profitMargin.toFixed(1)}%</td><td>{item.roi.toFixed(1)}%</td><td>{item.grossSales > 0 && !item.missingCost ? `${item.breakEvenTacos.toFixed(1)}%` : 'Unavailable'}</td></tr>)}</tbody></table></div>
    </section>
  </>
}
