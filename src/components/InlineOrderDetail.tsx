import { ReviewOrderControl } from '../features/review-requests/ReviewOrderControl'
import { OrderActivityContext } from './OrderActivityContext'
import { returnTypeLabel } from './presentationLabels'
import { useContext, useMemo } from 'react'
import type { OrderProfitSummary } from '../core/analytics/orderProfit'
import { buildOrderAudit } from '../core/analytics/orderAudit'
import { orderTimeDimensions } from '../core/analytics/timeAnalysis'
import '../styles/inlineOrderDetail.css'
import { useScrollDetailIntoView } from './useScrollDetailIntoView'
import { ProductThumbnail } from './ProductThumbnail'
import { productImage, productTitles } from '../core/search/productTitles'

type Props = { readonly order: OrderProfitSummary; readonly formatMoney: (value: number) => string; readonly onCollapse: () => void }

export function InlineOrderDetail({ order, formatMoney, onCollapse }: Props) {
  const detailRef = useScrollDetailIntoView<HTMLDivElement>(order.orderId)
  const activities = useContext(OrderActivityContext)
  const activity = activities.find(item => item.orderId === order.orderId)
  const audit = useMemo(() => buildOrderAudit(order), [order])
  const timing = useMemo(() => orderTimeDimensions(order), [order])
  const bridgeMax = Math.max(1, ...audit.bridge.map(item => Math.abs(item.value)))
  const orderImage = useMemo(() => productImage(order.events), [order.events])
  const orderTitle = useMemo(() => productTitles(order.events)[0], [order.events])
  return <div className="inline-order-detail" ref={detailRef} onClick={event => event.stopPropagation()}>
    <header><div><span>Order explanation</span><strong>{order.orderId}</strong><small>{timing ? `${timing.date} · ${timing.time} · ${timing.weekday} · ${timing.week}` : order.date ?? 'Date unavailable'}</small></div><button onClick={onCollapse}>Collapse ↑</button></header>
    <ReviewOrderControl orderId={order.orderId}/>
    {activity ? <section className="inline-activity-status"><strong>Recorded order activity · updates as new entries arrive</strong><p>Purchased: {activity.saleDate} · latest recorded activity: {activity.lastEventDate ?? 'Awaiting financial details'}</p><p>Includes recorded sales, charges, refunds and reimbursements regardless of release status.</p>{!activity.recorded.costComplete ? <p className="pending-note">Costs are incomplete; profit follows the configured missing-cost policy.</p> : null}</section> : null}
    <div className="inline-order-summary"><div><span>Product</span><div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>{orderImage ? <ProductThumbnail url={orderImage} /> : null}<div><strong>{orderTitle || order.skus.join(', ') || '—'}</strong>{orderTitle && order.skus.length ? <small style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>{order.skus.join(', ')}</small> : null}</div></div></div><div><span>Location</span><strong>{[order.city, order.state].filter(Boolean).join(', ') || '—'}</strong></div><div><span>Payment</span><strong>{order.accountType ?? '—'}</strong></div><div><span>Fulfilment</span><strong>{order.fulfillmentType ?? '—'}</strong></div><div><span>Sold / returned</span><strong>{order.soldQuantity} / {order.returnQuantity}</strong></div><div><span>Return type</span><strong>{returnTypeLabel(order.returnType)}</strong></div><div><span>Profit / delivered unit</span><strong>{order.profitPerDeliveredUnit === null ? 'Unavailable' : formatMoney(order.profitPerDeliveredUnit)}</strong></div><div><span>Break-even TACOS</span><strong>{order.breakEvenTacos === null ? 'Unavailable' : `${order.breakEvenTacos.toFixed(2)}%`}</strong></div></div>
    {order.returnQuantity > 0 ? <section className="inline-return-explanation"><div><span>Return classification</span><strong>{returnTypeLabel(order.returnType)}</strong></div><p>{order.returnEvidence ?? 'No classification evidence is available.'}</p><small>Returned goods are treated as resellable; COGS is recovered according to the configured return policy.</small></section> : null}
    {order.costApplications?.length ? <section className="inline-cost-evidence"><div className="section-label"><span>Applied product costs</span><small>Cost record selected from the sale date</small></div>{order.costApplications.map(item => { const itemEvents = order.events.filter(e => e.sku === item.sku); const itemImg = productImage(itemEvents); const itemTitle = productTitles(itemEvents)[0]; return <div key={item.eventId}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{itemImg ? <ProductThumbnail url={itemImg} /> : null}<span><strong>{itemTitle || item.sku}</strong><small>{itemTitle ? `${item.sku} · ` : ''}{item.costDate ? `Effective from ${item.costDate}` : 'Default fallback cost'} · {item.quantity} unit{item.quantity === 1 ? '' : 's'}</small></span></div><b>{formatMoney(item.unitCost)} / unit</b><em className={item.cogs < 0 ? 'good-text' : ''}>{formatMoney(item.cogs)}</em></div> })}</section> : null}
    {audit.warnings.length ? <div className="inline-order-warnings">{audit.warnings.map(warning => <span key={warning}>⚠ {warning}</span>)}</div> : null}
    <div className="inline-order-grid"><section><div className="section-label"><span>Profit breakdown</span><small>How this order becomes profit</small></div><div className="inline-profit-bridge">{audit.bridge.map(item => <div className={item.kind.toLowerCase()} key={item.id}><span>{item.label}</span><i><b style={{ width: `${Math.abs(item.value) / bridgeMax * 100}%` }} /></i><strong className={item.value < 0 ? 'bad-text' : item.kind === 'RESULT' ? 'good-text' : ''}>{formatMoney(item.value)}</strong></div>)}</div></section><section><div className="section-label"><span>Fee audit</span><small>Order-associated deductions and reversals</small></div><div className="inline-fee-grid">{audit.feeGroups.length ? audit.feeGroups.map(item => <div key={item.label}><span>{item.label}</span><strong>{formatMoney(item.value)}</strong></div>) : <p>No order-level fees found.</p>}</div></section></div>
    <section className="inline-timeline"><div className="section-label"><span>Transaction timeline</span><small>Running balance includes operating events only</small></div><div className="table-scroll"><table><thead><tr><th>Posted date/time</th><th>Source label</th><th>Classification</th><th>Amount</th><th>Running balance</th></tr></thead><tbody>{audit.timeline.map(item => <tr key={item.id}><td>{item.date ?? '—'}</td><td>{item.rawLabel}</td><td>{item.event} · {item.amountType}{!item.classified ? <small className="bad-text">Needs review</small> : null}</td><td className={item.amount < 0 ? 'bad-text' : 'good-text'}>{formatMoney(item.amount)}</td><td>{formatMoney(item.runningBalance)}</td></tr>)}</tbody></table></div></section>
  </div>
}
