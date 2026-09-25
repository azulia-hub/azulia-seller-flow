import { useMemo, useState } from 'react'
import type { CompletedOrderCohort, OrderLifecycle, OrderLifecycleStatus } from '../core/analytics/orderLifecycle'

type Props = {
  readonly cohort: CompletedOrderCohort
  readonly formatMoney: (value: number) => string
  readonly onClose: () => void
}

const statusLabel: Record<OrderLifecycleStatus, string> = {
  COMPLETED_DELIVERED: 'Completed · delivered',
  COMPLETED_RETURNED: 'Completed · returned',
  INCOMPLETE_COVERAGE: 'Awaiting coverage',
  INCOMPLETE_DEFERRED: 'Deferred activity',
  INCOMPLETE_MISSING_SALE: 'Original sale missing',
}

const statusTone = (status: OrderLifecycleStatus) => status.startsWith('COMPLETED') ? 'good' : status === 'INCOMPLETE_MISSING_SALE' ? 'bad' : 'warn'

export function OrderLifecycleSnapshot({ cohort, formatMoney, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<OrderLifecycleStatus | 'ALL'>('ALL')
  const orders = useMemo(() => [...cohort.incomplete, ...cohort.missingSale]
    .filter(order => status === 'ALL' || order.status === status)
    .filter(order => !query || order.orderId.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((left, right) => (right.saleDate ?? right.lastEventDate ?? '').localeCompare(left.saleDate ?? left.lastEventDate ?? '')), [cohort, query, status])

  return <div className="drilldown-backdrop lifecycle-snapshot-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="order-lifecycle-snapshot" role="dialog" aria-modal="true" aria-labelledby="order-lifecycle-title">
      <header className="drilldown-head"><div><button className="workspace-back" onClick={onClose}>← Dashboard</button><small>Completed-order performance</small><h2 id="order-lifecycle-title">Orders not included</h2><p>Order cycles excluded from performance for {cohort.range.from} to {cohort.range.to}, with the money and evidence still waiting to be included.</p></div><button className="close" aria-label="Close excluded orders snapshot" onClick={onClose}>×</button></header>
      <div className="lifecycle-snapshot-body">
        <section className="lifecycle-snapshot-kpis" aria-label="Order lifecycle totals">
          <article className="warning"><span>Orders not included</span><strong>{(cohort.incompleteOrderCount + cohort.missingSaleOrderCount).toLocaleString('en-IN')}</strong><small>Immature, deferred or missing-origin cycles</small></article>
          <article className={cohort.incompleteSales ? 'warning' : ''}><span>Sales not included yet</span><strong>{formatMoney(cohort.incompleteSales)}</strong><small>Sales awaiting lifecycle completion</small></article>
          <article className={cohort.excludedOrderCharges ? 'warning' : ''}><span>Order charges not included</span><strong>{formatMoney(cohort.excludedOrderCharges)}</strong><small>Net charges on excluded cycles</small></article>
          <article className={cohort.excludedRefundValue ? 'warning' : ''}><span>Refunds not included yet</span><strong>{formatMoney(cohort.excludedRefundValue)}</strong><small>Refunds on excluded cycles</small></article>
          <article className={cohort.excludedReimbursements ? 'warning' : ''}><span>Reimbursements not included</span><strong>{formatMoney(cohort.excludedReimbursements)}</strong><small>Reimbursements on excluded cycles</small></article>
          <article><span>Observation through</span><strong>{cohort.observationThrough ?? '—'}</strong><small>{cohort.maturityDays}-day lifecycle rule</small></article>
        </section>

        <section className="lifecycle-method-note"><strong>Why are these orders excluded?</strong><p>An order stays here when its follow-up window has not finished, a linked transaction is deferred, or its original sale is missing from imported history. These events remain in Posted activity and will move into performance automatically when the required evidence becomes available.</p></section>

        <div className="lifecycle-order-controls"><label>Search order<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Order ID" /></label><label>Exclusion reason<select value={status} onChange={event => setStatus(event.target.value as typeof status)}><option value="ALL">All excluded orders</option>{Object.entries(statusLabel).filter(([value]) => value.startsWith('INCOMPLETE')).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><span>{orders.length.toLocaleString('en-IN')} of {(cohort.incompleteOrderCount + cohort.missingSaleOrderCount).toLocaleString('en-IN')} excluded orders</span></div>

        <div className="table-scroll lifecycle-order-table"><table><thead><tr><th>Order</th><th>Sale date</th><th>Last activity</th><th>Status</th><th>Sale</th><th>Charges</th><th>Refund</th><th>Reimbursement</th><th>Evidence</th></tr></thead><tbody>{orders.map((order: OrderLifecycle) => <tr key={order.orderId}><td><strong>{order.orderId}</strong><small>{order.events.length} financial event{order.events.length === 1 ? '' : 's'}</small></td><td>{order.saleDate ?? 'Not imported'}</td><td>{order.lastEventDate ?? '—'}</td><td><span className={`pill ${statusTone(order.status)}`}>{statusLabel[order.status]}</span></td><td>{formatMoney(order.grossSales)}</td><td>{formatMoney(order.netOrderCharges)}</td><td>{formatMoney(order.refundValue)}</td><td>{formatMoney(order.reimbursements)}</td><td className="lifecycle-reason">{order.reason}{order.lifecycleDeadline ? <small>Deadline: {order.lifecycleDeadline}</small> : null}</td></tr>)}</tbody></table>{!orders.length ? <div className="empty-state">No order lifecycles match these filters.</div> : null}</div>
      </div>
    </section>
  </div>
}
