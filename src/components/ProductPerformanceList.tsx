import { ProductThumbnail } from './ProductThumbnail'
import { ChoiceGroup } from './ChoiceGroup'
import { useDeferredValue, useMemo, useState } from 'react'
import { selectSellerProducts, type SellerProductOverview } from '../core/advertising/sellerOverview'
import { compareProductPerformance, productPerformanceFigures, type HistoryCoverage } from '../core/analytics/productPerformance'
import type { SkuProfitSummary } from '../core/analytics/orderProfit'
import type { DateRange } from '../core/analytics/timePeriods'
import { ProductComparison } from './ProductComparison'
const columns = [
  ['sales', 'Gross sales'], ['proceeds', 'Net Amazon proceeds'], ['orders', 'Orders'], ['units', 'Units sold'],
  ['refunds', 'Refund value'], ['returns', 'Returns'], ['fees', 'Marketplace charges'], ['shipping', 'Shipping fees'],
  ['reimbursements', 'Reimbursements'], ['costs', 'Product costs'], ['margin', 'Profit margin'], ['profit', 'Profit'],
] as const
type Column = typeof columns[number][0]
export function ProductPerformanceList({ rows, formatMoney, onSelect, basis, dateLabel, mode, full = false, onViewAll, previousProducts = [], comparisonRange, comparisonCoverage = 'UNVERIFIED', onRequestHistory, comparisonAsOf }: {
  basis: string; dateLabel: string; mode: 'FINANCIAL' | 'ADVERTISING'; full?: boolean; onViewAll?: () => void;
  rows: readonly SellerProductOverview[]; formatMoney: (value: number) => string; onSelect: (sku: string) => void
  comparisonAsOf?:string;
  onRequestHistory?: () => Promise<unknown>; historyBusy?: boolean;
  previousProducts?: readonly SkuProfitSummary[]; comparisonRange?: DateRange; comparisonCoverage?: HistoryCoverage
}) {
  const [showComparison,setShowComparison]=useState(true)
  const [query, setQuery] = useState('')
  const [requestingHistory, setRequestingHistory] = useState(false)
  const [historyMessage, setHistoryMessage] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [sort, setSort] = useState<'SALES' | 'RESULT' | 'RETURNS'>('SALES')
  const [status, setStatus] = useState<'ALL' | 'MISSING_COST' | 'LOSS'>('ALL')
  const [selectedColumns, setSelectedColumns] = useState<readonly Column[]>(['sales', 'proceeds', 'returns', 'profit'])
  const [page, setPage] = useState(0)
  const advertising = mode === 'ADVERTISING'
  const matched = useMemo(() => selectSellerProducts(rows, { query: deferredQuery, sort, status, advertising }), [rows, deferredQuery, sort, status, advertising])
  const previous = useMemo(() => new Map(previousProducts.map(product => [product.sku, product])), [previousProducts])
  const pageSize = full ? 25 : 8
  const currentPage = Math.min(page, Math.max(0, Math.ceil(matched.length / pageSize) - 1))
  const visible = useMemo(() => matched.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(row => ({ row,
    figures: productPerformanceFigures(row.product), comparison: compareProductPerformance(row.product, previous.get(row.sku), comparisonCoverage),
  })), [matched, currentPage, pageSize, previous, comparisonCoverage])
  const shown = columns.filter(([key]) => selectedColumns.includes(key))
  return <section className="seller-section seller-products" aria-label="Product performance">
    <div className="seller-section-heading"><div><h2>{full ? 'Product performance' : 'Your products'} <span className="product-count">{rows.length}</span></h2><p className="product-period-basis">{basis} · {dateLabel}</p>{full && comparisonRange && showComparison ? <small>Compared with {comparisonRange.from} – {comparisonRange.to}. {comparisonCoverage === 'DOWNLOADED' ? 'Purchase and transaction date windows downloaded; later activity can change both periods.' : 'Comparison history incomplete or unverified; percentage changes are hidden.'}</small> : null}</div>{!full && onViewAll ? <button className="text-btn" onClick={onViewAll}>View all products →</button> : null}</div>
    {full&&comparisonRange?<section className="product-comparison-panel" aria-label="Period comparison"><h3>Compare performance</h3><p>{dateLabel} <strong>vs</strong> {comparisonRange.from} – {comparisonRange.to}</p><label><input type="checkbox" checked={showComparison} onChange={event=>setShowComparison(event.target.checked)}/>Show previous-period values and changes</label><small>{comparisonAsOf?`Current data observed through ${new Date(comparisonAsOf).toLocaleString('en-IN')}. The current period may still be in progress; the previous dates are a completed calendar period.`:'Changes appear when both date windows have downloaded coverage. Missing history is not treated as zero.'}</small></section>:null}
    {full && comparisonRange && comparisonCoverage !== 'DOWNLOADED' && onRequestHistory ? <div className="product-history-request"><button className="secondary" disabled={requestingHistory} onClick={() => { setRequestingHistory(true); setHistoryMessage(''); void onRequestHistory().then(() => setHistoryMessage('History requested. Results update here as records arrive.')).catch(() => setHistoryMessage('Could not request history. Saved results are unchanged; try again.')).finally(() => setRequestingHistory(false)) }}>{requestingHistory ? 'Updating history…' : 'Download comparison history'}</button>{historyMessage ? <small role="status">{historyMessage}</small> : null}</div> : null}
    <div className="product-list-controls"><label className="seller-product-search"><input type="search" aria-label="Find a product" placeholder="Search title or SKU" value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} /></label><ChoiceGroup label="Product status" value={status} options={[{ value: 'ALL', label: 'All products' }, { value: 'MISSING_COST', label: 'Missing costs' }, { value: 'LOSS', label: 'Loss-making' }]} onChange={value => { setStatus(value); setPage(0) }} /><select aria-label="Sort products" value={sort} onChange={event => { setSort(event.target.value as typeof sort); setPage(0) }}><option value="SALES">Highest sales</option><option value="RESULT">Highest {advertising ? 'profit after ads' : 'profit'}</option><option value="RETURNS">Highest return rate</option></select>
    {full ? <details className="product-column-picker"><summary>Columns</summary><fieldset><legend>Visible product metrics</legend>{columns.map(([key,label]) => <label key={key}><input type="checkbox" checked={selectedColumns.includes(key)} disabled={selectedColumns.length === 1 && selectedColumns.includes(key)} onChange={event => setSelectedColumns(current => event.target.checked ? [...current,key] : current.filter(value => value !== key))}/>{label}</label>)}</fieldset></details> : null}</div>
    <div className="table-scroll" aria-busy={query !== deferredQuery}><table><thead><tr><th className="product-column">Product</th>{shown.map(([key,label]) => <th key={key}>{key === 'profit' ? advertising ? 'Profit after ads' : 'Profit before ads' : label}</th>)}{advertising ? <><th>Reported ad spend</th><th>ACOS</th></> : null}</tr></thead><tbody>{visible.map(({row,figures,comparison}) => {
      const amount = advertising ? row.contribution : row.product.missingCost ? null : row.product.profitBeforeAds
      return <tr key={row.sku}><td className="product-column"><button className="seller-product-link" title={row.name ?? row.sku} onClick={() => onSelect(row.sku)}><ProductThumbnail key={row.imageUrl ?? row.sku} url={row.imageUrl} /><span><strong>{row.name ?? row.sku}</strong>{row.name ? <small>{row.sku}</small> : null}</span><span className="product-open-arrow" aria-hidden="true">›</span></button></td>
      {shown.map(([key]) => <td key={key}>
        {key === 'sales' ? <>{formatMoney(row.product.grossSales)}{full && comparisonRange && showComparison ? <ProductComparison change={comparison.sales} formatValue={formatMoney}/> : null}</>
        : key === 'returns' ? <>{row.product.returnQuantity} <small>({row.product.returnRate.toFixed(1)}%)</small>{full && comparisonRange && showComparison ? <ProductComparison change={comparison.returnRate} formatValue={value=>`${value}%`}/> : null}</>
        : key === 'profit' ? <>{amount !== null ? <strong className={amount < 0 ? 'bad-text' : 'good-text'}>{formatMoney(amount)}</strong> : <small>{row.product.missingCost || row.contributionStatus === 'MISSING_COST' ? 'Add product cost' : row.contributionStatus === 'NO_FINANCIAL_ACTIVITY' ? 'No financial activity' : 'No matched ads data'}</small>}{!advertising && full && comparisonRange && showComparison ? <ProductComparison change={comparison.profit} formatValue={formatMoney}/> : null}</>
        : key === 'orders' || key === 'units' ? <>{figures[key].toLocaleString('en-IN')}{full && comparisonRange && showComparison ? <ProductComparison change={comparison[key]}/> : null}</>
        : key === 'margin' ? <>{figures.margin === null ? '—' : `${figures.margin}% before ads`}{full && comparisonRange && showComparison ? <ProductComparison change={comparison.margin} formatValue={value=>`${value}%`}/> : null}</>
        : <>{figures[key] === null ? 'Add product cost' : formatMoney(figures[key]!)}{key === 'proceeds' && full && comparisonRange && showComparison ? <ProductComparison change={comparison.proceeds} formatValue={formatMoney}/> : null}</>}
      </td>)}{advertising ? <><td>{row.advertising ? formatMoney(row.advertising.spend) : '—'}</td><td>{row.advertising?.acos == null ? '—' : `${row.advertising.acos.toFixed(2)}%`}</td></> : null}</tr>
    })}{!visible.length ? <tr><td colSpan={1 + shown.length + (advertising ? 2 : 0)}>{query || status !== 'ALL' ? 'No products match these filters.' : 'No recorded product financial activity in this selection.'}</td></tr> : null}</tbody></table></div>
    <div className="product-table-footer"><small>{matched.length ? `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, matched.length)} of ${matched.length} products` : '0 products'}</small>{full ? <div><button className="secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><button className="secondary" disabled={(currentPage + 1) * pageSize >= matched.length} onClick={() => setPage(currentPage + 1)}>Next</button></div> : matched.length > pageSize && onViewAll ? <button className="text-btn" onClick={onViewAll}>See all {matched.length} products →</button> : null}</div>
    <small className="seller-footnote">Net Amazon proceeds = sales − customer refunds − net marketplace/shipping charges + reimbursements; before product costs, advertising and separate tax adjustments. This is not a bank deposit. {advertising ? 'Profit after ads uses reported ad spend; excludes ad GST and account expenses.' : 'Product profit is before unassigned advertising and account expenses.'}</small>
  </section>
}
