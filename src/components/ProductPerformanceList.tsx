import { ChoiceGroup } from './ChoiceGroup'
import { useDeferredValue, useMemo, useState } from 'react'
import { selectSellerProducts, type SellerProductOverview } from '../core/advertising/sellerOverview'

export function ProductPerformanceList({ rows, formatMoney, onSelect, basis, dateLabel, mode, full = false, onViewAll }: {
  basis: string; dateLabel: string; mode: 'FINANCIAL' | 'ADVERTISING'; full?: boolean; onViewAll?: () => void;
  rows: readonly SellerProductOverview[]; formatMoney: (value: number) => string; onSelect: (sku: string) => void
}) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [sort, setSort] = useState<'SALES' | 'RESULT' | 'RETURNS'>('SALES')
  const [status, setStatus] = useState<'ALL' | 'MISSING_COST' | 'LOSS'>('ALL')
  const [page, setPage] = useState(0)
  const advertising = mode === 'ADVERTISING'
  const matched = useMemo(() => selectSellerProducts(rows, { query: deferredQuery, sort, status, advertising }), [rows, deferredQuery, sort, status, advertising])
  const pageSize = full ? 25 : 8
  const currentPage = Math.min(page, Math.max(0, Math.ceil(matched.length / pageSize) - 1))
  const visible = matched.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  return <section className="seller-section seller-products" aria-label="Product performance">
    <div className="seller-section-heading"><div><h2>{full ? 'Product performance' : 'Your products'} <span className="product-count">{rows.length}</span></h2><p className="product-period-basis">{basis} · {dateLabel}</p></div>{!full && onViewAll ? <button className="text-btn" onClick={onViewAll}>View all products →</button> : null}</div>
    <div className="product-list-controls"><label className="seller-product-search"><input type="search" aria-label="Find a product" placeholder="Search title or SKU" value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} /></label><ChoiceGroup label="Product status" value={status} options={[{ value: 'ALL', label: 'All products' }, { value: 'MISSING_COST', label: 'Missing costs' }, { value: 'LOSS', label: 'Loss-making' }]} onChange={value => { setStatus(value); setPage(0) }} /><select aria-label="Sort products" value={sort} onChange={event => { setSort(event.target.value as typeof sort); setPage(0) }}><option value="SALES">Highest sales</option><option value="RESULT">Highest {advertising ? 'profit after ads' : 'profit'}</option><option value="RETURNS">Highest return rate</option></select></div>
    <div className="table-scroll" aria-busy={query !== deferredQuery}><table><thead><tr><th className="product-column">Product</th><th className="sales-column">Total product sales</th>{advertising ? <><th>Reported ad spend</th><th>ACOS</th></> : null}<th>Returns</th><th className="result-column">{advertising ? 'Profit after ads' : 'Profit before ads'}</th></tr></thead><tbody>{visible.map(row => {
      const amount = advertising ? row.contribution : row.product.missingCost ? null : row.product.profitBeforeAds
      return <tr key={row.sku}><td className="product-column"><button className="seller-product-link" onClick={() => onSelect(row.sku)}><span className="product-avatar" aria-hidden="true">{(row.name ?? row.sku).slice(0,1).toUpperCase()}</span><span><strong>{row.name ?? row.sku}</strong>{row.name ? <small>{row.sku}</small> : null}</span><span className="product-open-arrow" aria-hidden="true">›</span></button></td><td className="sales-column">{formatMoney(row.product.grossSales)}</td>{advertising ? <><td>{row.advertising ? formatMoney(row.advertising.spend) : '—'}</td><td>{row.advertising?.acos == null ? '—' : `${row.advertising.acos.toFixed(2)}%`}</td></> : null}<td>{row.product.returnQuantity} <small>({row.product.returnRate.toFixed(1)}%)</small></td><td className="result-column">{amount !== null ? <strong className={amount < 0 ? 'bad-text' : 'good-text'}>{formatMoney(amount)}</strong> : <small>{row.product.missingCost || row.contributionStatus === 'MISSING_COST' ? 'Add product cost' : row.contributionStatus === 'NO_FINANCIAL_ACTIVITY' ? 'No financial activity' : 'No matched ads data'}</small>}</td></tr>
    })}{!visible.length ? <tr><td colSpan={advertising ? 6 : 4}>{query || status !== 'ALL' ? 'No products match these filters.' : 'No product activity in this selection.'}</td></tr> : null}</tbody></table></div>
    <div className="product-table-footer"><small>{matched.length ? `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, matched.length)} of ${matched.length} products` : '0 products'}</small>{full ? <div><button className="secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><button className="secondary" disabled={(currentPage + 1) * pageSize >= matched.length} onClick={() => setPage(currentPage + 1)}>Next</button></div> : matched.length > pageSize && onViewAll ? <button className="text-btn" onClick={onViewAll}>See all {matched.length} products →</button> : null}</div>
    <small className="seller-footnote">{advertising ? 'Profit after ads uses reported ad spend; excludes ad GST and account expenses.' : 'Product profit is before unassigned advertising and account expenses. Business profit includes booked account expenses.'}</small>
  </section>
}
