import { useMemo, useState } from 'react'
import { summarizeCohortOrders, type OrderCohort } from '../core/analytics/orderLifecycle'

/** Orders can exist before financial postings; source order totals are never treated as revenue. */
export function LiveOrderList({ cohort }: { cohort: OrderCohort }) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const summary = useMemo(() => summarizeCohortOrders(cohort), [cohort])
  const rows = useMemo(() => cohort.orders.filter(order => order.orderId.toLowerCase().includes(query.trim().toLowerCase()))
    .slice().sort((a, b) => (b.saleDate ?? '').localeCompare(a.saleDate ?? '') || a.orderId.localeCompare(b.orderId)), [cohort, query])
  const current = Math.min(page, Math.max(0, Math.ceil(rows.length / 15) - 1))
  return <details className="seller-disclosure live-order-list">
    <summary>Orders in this period · {summary.count.toLocaleString('en-IN')}{summary.awaitingFinancialCount ? ` · ${summary.awaitingFinancialCount} awaiting financial details` : ''}</summary>
    <p className="seller-footnote">Orders appear when downloaded from Amazon. Order value may include tax and shipping; sales and profit use recorded financial entries. Refunds and reimbursements update the original purchase period.</p>
    <input type="search" aria-label="Find order in purchase period" placeholder="Find order ID" value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} />
    <div className="table-scroll"><table><thead><tr><th>Order</th><th>Purchased</th><th>Order status</th><th>Order value</th><th>Financial details</th></tr></thead><tbody>
      {rows.slice(current * 15, (current + 1) * 15).map(order => <tr key={order.orderId}><td>{order.orderId}</td><td>{order.saleDate}</td><td>{order.order?.status ?? 'Not provided'}</td><td>{order.order?.orderValue !== null && order.order?.orderValue !== undefined ? `${order.order.currency ?? ''} ${order.order.orderValue}` : 'Not provided'}</td><td>{order.events.length ? 'Recorded activity included' : 'Awaiting financial details'}</td></tr>)}
      {!rows.length ? <tr><td colSpan={5}>No orders match this search.</td></tr> : null}
    </tbody></table></div>
    <div className="live-order-pagination"><small>Page {current + 1} of {Math.max(1, Math.ceil(rows.length / 15))}</small><button className="secondary" disabled={!current} onClick={() => setPage(current - 1)}>Previous</button><button className="secondary" disabled={(current + 1) * 15 >= rows.length} onClick={() => setPage(current + 1)}>Next</button></div>
  </details>
}
