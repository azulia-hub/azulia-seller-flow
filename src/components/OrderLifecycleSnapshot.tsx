import { useMemo, useState } from 'react'
import type { CohortFinancials, OrderCohort } from '../core/analytics/orderLifecycle'
import { isDeferred } from '../core/analytics/orderLifecycle'

type Props = { readonly cohort: OrderCohort; readonly financials: CohortFinancials; readonly formatMoney: (value: number) => string; readonly onClose: () => void }

export function OrderLifecycleSnapshot({ cohort, financials, formatMoney, onClose }: Props) {
  const [tab, setTab] = useState<'PENDING' | 'MISSING'>('PENDING')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const orders = useMemo(() => (tab === 'PENDING' ? financials.orders.filter(o => o.pendingEvents.length) : financials.unmatched)
    .filter(order => !query || order.orderId.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (b.saleDate ?? b.lastEventDate ?? '').localeCompare(a.saleDate ?? a.lastEventDate ?? '')), [financials, query, tab])
  const globalPending = cohort.pendingEvents.filter(e => !e.orderId)
  return <div className="drilldown-backdrop lifecycle-snapshot-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="order-lifecycle-snapshot" role="dialog" aria-modal="true" aria-labelledby="order-lifecycle-title">
      <header className="drilldown-head"><div><button className="workspace-back" onClick={onClose}>← Dashboard</button><small>Orders sold in selected period</small><h2 id="order-lifecycle-title">Pending &amp; unmatched activity</h2><p>{cohort.range.from} → {cohort.range.to} · activity observed through {cohort.observationThrough ?? 'unknown'}</p></div><button className="close" aria-label="Close activity review" onClick={onClose}>×</button></header>
      <div className="lifecycle-snapshot-body">
        <section className="lifecycle-method-note"><strong>Known activity stays included</strong><p>Released transactions on selected orders contribute to the main results. Deferred amounts are pending. Activity without its original sale remains unmatched; its sales month is never guessed. Posted activity retains every source event for reconciliation.</p>{cohort.supersededEvents.length > 0 ? <p>{cohort.supersededEvents.length} deferred event components have identical released counterparts and are counted only once in order analysis.</p> : null}</section>
        <div className="product-mode activity-tabs" role="tablist" aria-label="Activity review"><button role="tab" aria-selected={tab === 'PENDING'} className={tab === 'PENDING' ? 'active' : ''} onClick={() => { setTab('PENDING'); setExpanded(null) }}>Pending transactions ({cohort.pendingOrderCount} orders)</button><button role="tab" aria-selected={tab === 'MISSING'} className={tab === 'MISSING' ? 'active' : ''} onClick={() => { setTab('MISSING'); setExpanded(null) }}>Original sale missing ({cohort.missingSale.length})</button></div>
        <div className="lifecycle-order-controls"><label>Search order<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Order ID" /></label><span>{orders.length} matching orders</span></div>
        <div role="tabpanel" aria-label={tab === 'PENDING' ? 'Pending transactions' : 'Original sale missing'} className="activity-order-list">
          {orders.map(order => <article key={order.orderId} className="activity-order-card">
            <button className="activity-order-toggle" aria-expanded={expanded === order.orderId} onClick={() => setExpanded(expanded === order.orderId ? null : order.orderId)}><span><strong>{order.orderId}</strong><small>Original sale: {order.saleDate ?? 'Missing'} · latest activity: {order.lastEventDate ?? 'Unknown'}</small></span><span>{tab === 'PENDING' ? `${order.pendingEvents.length} pending financial components` : 'Sales month unknown'} · {expanded === order.orderId ? 'Collapse ↑' : 'View evidence ↓'}</span></button>
            {expanded === order.orderId ? <div className="activity-order-evidence"><div className="pending-activity-grid"><article><span>Released sales</span><strong>{formatMoney(order.released.grossSales)}</strong></article><article><span>Released profit</span><strong>{order.released.profit === null ? 'Missing costs' : formatMoney(order.released.profit)}</strong></article><article><span>Pending operating net</span><strong>{formatMoney(order.pending.operatingNet)}</strong></article><article><span>Estimated profit including pending</span><strong>{order.estimated.profit === null ? 'Missing costs' : formatMoney(order.estimated.profit)}</strong></article></div>{!order.estimated.costComplete ? <p className="pending-note">Costs are incomplete; profit follows the configured missing-cost policy.</p> : null}<p>{tab === 'MISSING' ? 'These amounts are evidence only and are excluded from the selected sales cohort.' : 'Only deferred components are excluded from the main results.'}</p><div className="table-scroll"><table><thead><tr><th>Date</th><th>Source transaction</th><th>Component</th><th>Status</th><th>Signed amount</th></tr></thead><tbody>{order.events.map(event => <tr key={event.id}><td>{event.date}</td><td>{event.rawType || event.rawDescription || event.event}</td><td>{event.amountType}</td><td><span className={isDeferred(event) ? 'pending-note' : ''}>{event.status || 'Not provided'}</span></td><td>{formatMoney(event.amount)}</td></tr>)}</tbody></table></div></div> : null}
          </article>)}
          {!orders.length ? <p className="empty-state">No matching orders.</p> : null}
          {tab === 'PENDING' && globalPending.length > 0 ? <section className="activity-order-card"><h3>Pending account-level activity</h3><p>Uses posting dates in the selected period; no order attribution is invented.</p><div className="table-scroll"><table><thead><tr><th>Date</th><th>Source label</th><th>Status</th><th>Amount</th></tr></thead><tbody>{globalPending.map(e => <tr key={e.id}><td>{e.date}</td><td>{e.rawType}</td><td>{e.status}</td><td>{formatMoney(e.amount)}</td></tr>)}</tbody></table></div></section> : null}
        </div>
      </div>
    </section>
  </div>
}
