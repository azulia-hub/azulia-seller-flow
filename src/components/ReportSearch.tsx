import { ChoiceGroup } from './ChoiceGroup'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { searchReport, type ReportSearchDocument, type ReportSearchField } from '../core/search/reportSearch'
import type { CanonicalFinancialEvent } from '../core/data/types'
import type { OrderProfitSummary } from '../core/analytics/orderProfit'
import { InlineOrderDetail } from './InlineOrderDetail'
import { ProductCostEditor } from './ProductCostEditor'

import { ProductThumbnail } from './ProductThumbnail'

const searchModes: readonly { value: ReportSearchField; label: string; placeholder: string; empty: string }[] = [
  { value:'ALL', label:'All', placeholder:'Product title, SKU, ASIN, order or location', empty:'No matches. Try a product title, SKU, ASIN, order ID, city or state.' },
  { value:'SKU', label:'SKU', placeholder:'Enter SKU', empty:'No SKUs match. Try the product SKU from your report.' },
  { value:'IDENTITY', label:'ASIN', placeholder:'Enter ASIN', empty:'No ASINs match. ASIN search needs matched identities from your advertising report.' },
  { value:'TITLE', label:'Title', placeholder:'Enter product title', empty:'No titles match. Try words from the product title or description in your report.' },
  { value:'CITY', label:'City', placeholder:'Enter city', empty:'No cities match in this report.' },
  { value:'ORDER', label:'Order', placeholder:'Enter order ID', empty:'No order IDs match in this report.' },
  { value:'LOCATION', label:'Location', placeholder:'Enter city or state', empty:'No locations match. Try a city, state or both.' },
]
const kinds = { PRODUCT: 'Product', ORDER: 'Order', LOCATION: 'Location', TRANSACTION: 'Account transaction' }
export function ReportSearch({ documents, onSelect, productScopeLabel = 'all report dates' }: { productScopeLabel?: string; documents: readonly ReportSearchDocument[]; onSelect: (result: ReportSearchDocument) => void }) {
  const [query, setQuery] = useState('')
  const [field, setField] = useState<ReportSearchField>('ALL')
  const [expanded, setExpanded] = useState(true)
  const id = useId()
  const mode = searchModes.find(option => option.value === field)!
  const matches = useMemo(() => searchReport(documents, query, 30, field), [documents, query, field])
  return <section className="report-search" aria-label="Search active report">
    <label htmlFor={id}>Search your report</label>
    <ChoiceGroup className="search-mode-choices" label="Search by" value={field} onChange={value => { setField(value); setExpanded(true) }} options={searchModes} /><div className="report-search-field"><span aria-hidden="true">⌕</span><input id={id} type="search" placeholder={mode.placeholder} value={query} onChange={event => { setQuery(event.target.value); setExpanded(true) }} onFocus={() => setExpanded(true)} onKeyDown={event => { if (event.key === 'Escape') setExpanded(false) }} aria-controls={`${id}-results`} aria-expanded={Boolean(query.trim() && expanded)} autoComplete="off" />{query ? <button className="text-btn" onClick={() => setQuery('')}>Clear search</button> : null}</div>
    <small>Searches all dates in the active financial report, including orders outside dashboard filters. Product titles use title/name columns or sale descriptions. ASIN search uses matched identities from your ads report.</small>
    {query.trim() && expanded ? <div className="report-search-results" id={`${id}-results`}><p className="search-scope">All dates in the active report · dashboard filters stay unchanged</p><p role="status">{matches.total ? `${matches.total} matches${matches.total > matches.results.length ? ` · showing the first ${matches.results.length}; refine your search for more` : ''}` : mode.empty}</p><ul>{matches.results.map(result => <li key={`${result.kind}:${result.id}`}><button onClick={() => { setExpanded(false); onSelect(result) }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{result.kind === 'PRODUCT' ? <ProductThumbnail url={result.imageUrl ?? null} /> : null}<div><span className="search-result-kind">{kinds[result.kind]}</span><strong>{result.label}</strong><small>{result.detail}</small><small>{result.kind === 'PRODUCT' ? `Open product · ${productScopeLabel}; dashboard filters unchanged` : 'View source evidence · all report dates'}</small></div></div></button></li>)}</ul></div> : null}
  </section>
}

export function ReportSearchDetail({ document, events, orders, formatMoney, onOpenProduct, onClose }: {
  document: ReportSearchDocument; events: readonly CanonicalFinancialEvent[]; orders: readonly OrderProfitSummary[];
  formatMoney: (value: number) => string; onOpenProduct: (sku: string) => void; onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [selectedOrder, setSelectedOrder] = useState<string | null>(document.orderId ?? null)
  const [limit, setLimit] = useState(50)
  const selected = orders.find(order => order.orderId === selectedOrder)
  const ids = useMemo(() => new Set(document.eventIds), [document])
  const evidence = events.filter(event => ids.has(event.id))
  const affectedOrders = orders.filter(order => order.events.some(event => ids.has(event.id)))
  const products = [...new Set(evidence.flatMap(event => event.sku ? [event.sku] : []))]
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close() }, [])
  return <dialog ref={ref} className="report-search-detail" aria-labelledby={titleId} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <header className="drilldown-head"><div><small>{kinds[document.kind]} · All dates in the active report</small><h2 id={titleId}>{document.label}</h2><p>Transactions by posting date. Dashboard filters are unchanged.</p></div><button className="secondary" autoFocus onClick={onClose}>Close search detail</button></header>
    <div className="search-detail-body">
      {products.length ? <section><h3>Products in this result</h3><div className="search-product-links">{products.map(sku => <button className="secondary" key={sku} onClick={() => onOpenProduct(sku)}>{sku} →</button>)}</div><small>Products open in a full-report profile. Dashboard filters stay unchanged.</small></section> : null}
      {selected ? <section><h3>Order {selected.orderId}</h3>{selected.skus.length === 1 ? selected.skus.map(sku => <ProductCostEditor key={sku} sku={sku} missingCost={selected.missingSkus.includes(sku)} />) : <p>Open a product above to edit its individual unit cost.</p>}<InlineOrderDetail order={selected} formatMoney={formatMoney} onCollapse={() => setSelectedOrder(null)} /></section> : null}
      {affectedOrders.length ? <section><h3>Orders</h3><div className="search-order-links">{affectedOrders.slice(0, limit).map(order => <button className="secondary" key={order.orderId} onClick={() => setSelectedOrder(order.orderId)}>{order.orderId}</button>)}</div></section> : null}
      <section><h3>Source transactions</h3><p>{evidence.length} preserved financial events{evidence.length > limit ? ` · showing the first ${limit}` : ''}</p><div className="table-scroll"><table><thead><tr><th>Date</th><th>Order</th><th>SKU</th><th>Source label</th><th>Amount</th><th>Status</th></tr></thead><tbody>{evidence.slice(0, limit).map(event => <tr key={event.id}><td>{event.date ?? 'Undated'}</td><td>{event.orderId ?? '—'}</td><td>{event.sku ?? '—'}</td><td>{event.rawDescription || event.rawType || event.amountType}</td><td>{formatMoney(event.amount)}</td><td>{event.classified ? 'Classified' : 'Needs review'}</td></tr>)}</tbody></table></div></section>
      {Math.max(evidence.length, affectedOrders.length) > limit ? <button className="secondary" onClick={() => setLimit(value => value + 50)}>Show more evidence</button> : null}
    </div>
  </dialog>
}
