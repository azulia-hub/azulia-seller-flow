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

interface OrderItemDetail {
  readonly id: string
  readonly sku: string
  readonly title: string
  readonly imageUrl: string | null
  readonly quantity: number | null
}

export function InlineOrderDetail({ order, formatMoney, onCollapse }: Props) {
  const detailRef = useScrollDetailIntoView<HTMLDivElement>(order.orderId)
  const activities = useContext(OrderActivityContext)
  const activity = activities.find(item => item.orderId === order.orderId)
  const audit = useMemo(() => buildOrderAudit(order), [order])
  const timing = useMemo(() => orderTimeDimensions(order), [order])
  const bridgeMax = Math.max(1, ...audit.bridge.map(item => Math.abs(item.value)))
  const orderImage = useMemo(() => productImage(order.events), [order.events])
  const orderTitle = useMemo(() => productTitles(order.events)[0], [order.events])

  const orderItems = useMemo<readonly OrderItemDetail[]>(() => {
    const sourceItems = activity?.order?.items
    if (sourceItems && sourceItems.length > 0) {
      const map = new Map<string, { sku: string; title: string; imageUrl: string | null; quantity: number | null; quantityUnknown: boolean }>()
      for (const item of sourceItems) {
        const key = item.sku || item.asin || item.title || 'item'
        const existing = map.get(key)
        const qty = typeof item.quantity === 'number' && item.quantity >= 0 ? item.quantity : null
        const isUnknown = qty === null
        if (!existing) {
          map.set(key, {
            sku: item.sku || '',
            title: item.title || '',
            imageUrl: item.imageUrl || null,
            quantity: qty,
            quantityUnknown: isUnknown,
          })
        } else {
          if (existing.quantityUnknown || isUnknown || existing.quantity === null || qty === null) {
            existing.quantity = null
            existing.quantityUnknown = true
          } else {
            existing.quantity += qty
          }
          if (!existing.title && item.title) existing.title = item.title
          if (!existing.imageUrl && item.imageUrl) existing.imageUrl = item.imageUrl
        }
      }
      return [...map.entries()].map(([k, v], idx) => ({
        id: `${k}-${idx}`,
        sku: v.sku,
        title: v.title,
        imageUrl: v.imageUrl,
        quantity: v.quantityUnknown ? null : v.quantity,
      }))
    }

    const skus = order.skus.length > 0 ? order.skus : [...new Set(order.events.map(e => e.sku).filter((s): s is string => Boolean(s)))]
    if (skus.length === 0) {
      const titles = productTitles(order.events)
      const img = productImage(order.events)
      if (titles.length > 0 || img) {
        return [{
          id: 'order-item-default',
          sku: '',
          title: titles[0] || '',
          imageUrl: img,
          quantity: order.soldQuantity > 0 ? order.soldQuantity : null,
        }]
      }
      return []
    }

    return skus.map((sku, idx) => {
      const skuEvents = order.events.filter(e => e.sku === sku)
      const titles = productTitles(skuEvents)
      const img = productImage(skuEvents)
      const costApp = order.costApplications?.find(c => c.sku === sku)
      let quantity: number | null = null
      if (costApp && typeof costApp.quantity === 'number') {
        quantity = costApp.quantity
      } else {
        const saleEvents = skuEvents.filter(e => e.event === 'SALE' && e.amountType === 'PRODUCT_REVENUE' && typeof e.quantity === 'number')
        if (saleEvents.length > 0) {
          quantity = saleEvents.reduce((sum, e) => sum + (e.quantity ?? 0), 0)
        } else if (order.soldQuantity > 0 && skus.length === 1) {
          quantity = order.soldQuantity
        }
      }
      return {
        id: `${sku}-${idx}`,
        sku,
        title: titles[0] || '',
        imageUrl: img,
        quantity,
      }
    })
  }, [activity?.order?.items, order.skus, order.events, order.costApplications, order.soldQuantity])

  const totalUnits = useMemo(() => {
    if (orderItems.length === 0) return null
    let sum = 0
    for (const item of orderItems) {
      if (item.quantity === null) return null
      sum += item.quantity
    }
    return sum
  }, [orderItems])

  return <div className="inline-order-detail" ref={detailRef} onClick={event => event.stopPropagation()}>
    <header><div><span>Order explanation</span><strong>{order.orderId}</strong><small>{timing ? `${timing.date} · ${timing.time} · ${timing.weekday} · ${timing.week}` : order.date ?? 'Date unavailable'}</small></div><button onClick={onCollapse}>Collapse ↑</button></header>
    <ReviewOrderControl orderId={order.orderId}/>
    {activity ? <section className="inline-activity-status"><strong>Recorded order activity · updates as new entries arrive</strong><p>Purchased: {activity.saleDate} · latest recorded activity: {activity.lastEventDate ?? 'Awaiting financial details'}</p><p>Includes recorded sales, charges, refunds and reimbursements regardless of release status.</p>{!activity.recorded.costComplete ? <p className="pending-note">Costs are incomplete; profit follows the configured missing-cost policy.</p> : null}</section> : null}
    <div className="inline-order-summary">
      <div>
        <span>Product</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          {orderImage ? <ProductThumbnail url={orderImage} /> : null}
          <div>
            <strong>
              {orderItems.length > 1
                ? `${orderItems.length} products · ${totalUnits !== null ? `${totalUnits} unit${totalUnits === 1 ? '' : 's'}` : 'quantity unknown'}`
                : orderItems.length === 1
                  ? (orderItems[0].title || orderItems[0].sku || orderTitle || '—')
                  : (orderTitle || order.skus.join(', ') || 'Product details pending')}
            </strong>
            {orderItems.length === 1 && orderItems[0].sku && orderItems[0].title && orderItems[0].sku !== orderItems[0].title ? (
              <small style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>{orderItems[0].sku}</small>
            ) : orderItems.length === 0 && order.skus.length ? (
              <small style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>{order.skus.join(', ')}</small>
            ) : null}
          </div>
        </div>
      </div>
      <div><span>Location</span><strong>{[order.city, order.state].filter(Boolean).join(', ') || '—'}</strong></div>
      <div><span>Payment</span><strong>{order.accountType ?? '—'}</strong></div>
      <div><span>Fulfilment</span><strong>{order.fulfillmentType ?? '—'}</strong></div>
      <div><span>Sold / returned</span><strong>{order.soldQuantity} / {order.returnQuantity}</strong></div>
      <div><span>Return type</span><strong>{returnTypeLabel(order.returnType)}</strong></div>
      <div><span>Profit / delivered unit</span><strong>{order.profitPerDeliveredUnit === null ? 'Unavailable' : formatMoney(order.profitPerDeliveredUnit)}</strong></div>
      <div><span>Break-even TACOS</span><strong>{order.breakEvenTacos === null ? 'Unavailable' : `${order.breakEvenTacos.toFixed(2)}%`}</strong></div>
    </div>
    <section className="inline-order-items">
      <div className="section-label">
        <span>Ordered items {orderItems.length > 0 ? `(${orderItems.length})` : ''}</span>
        <small>{orderItems.length > 1 ? `${totalUnits !== null ? `${totalUnits} total units` : 'Total quantity unknown'}` : 'Product identity and quantity'}</small>
      </div>
      {orderItems.length === 0 ? (
        <p className="pending-note" style={{ margin: '8px 0', fontSize: 11, color: 'var(--muted)' }}>
          Product details pending · awaiting source order metadata.
        </p>
      ) : (
        orderItems.map(item => (
          <div key={item.id} className="inline-order-item-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {item.imageUrl ? <ProductThumbnail url={item.imageUrl} /> : null}
              <div>
                <strong>{item.title || item.sku || 'Product details pending'}</strong>
                {item.sku && item.title && item.sku !== item.title ? (
                  <small style={{ display: 'block', fontSize: 10, color: 'var(--muted)' }}>SKU: {item.sku}</small>
                ) : null}
              </div>
            </div>
            <b>{item.quantity !== null ? `${item.quantity} unit${item.quantity === 1 ? '' : 's'}` : 'Quantity unknown'}</b>
          </div>
        ))
      )}
    </section>
    {order.returnQuantity > 0 ? <section className="inline-return-explanation"><div><span>Return classification</span><strong>{returnTypeLabel(order.returnType)}</strong></div><p>{order.returnEvidence ?? 'No classification evidence is available.'}</p><small>Returned goods are treated as resellable; COGS is recovered according to the configured return policy.</small></section> : null}
    {order.costApplications?.length ? <section className="inline-cost-evidence"><div className="section-label"><span>Applied product costs</span><small>Cost record selected from the sale date</small></div>{order.costApplications.map(item => { const itemEvents = order.events.filter(e => e.sku === item.sku); const itemImg = productImage(itemEvents); const itemTitle = productTitles(itemEvents)[0]; return <div key={item.eventId}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{itemImg ? <ProductThumbnail url={itemImg} /> : null}<span><strong>{itemTitle || item.sku}</strong><small>{itemTitle ? `${item.sku} · ` : ''}{item.costDate ? `Effective from ${item.costDate}` : 'Default fallback cost'} · {item.quantity} unit{item.quantity === 1 ? '' : 's'}</small></span></div><b>{formatMoney(item.unitCost)} / unit</b><em className={item.cogs < 0 ? 'good-text' : ''}>{formatMoney(item.cogs)}</em></div> })}</section> : null}
    {audit.warnings.length ? <div className="inline-order-warnings">{audit.warnings.map(warning => <span key={warning}>⚠ {warning}</span>)}</div> : null}
    <div className="inline-order-grid"><section><div className="section-label"><span>Profit breakdown</span><small>How this order becomes profit</small></div><div className="inline-profit-bridge">{audit.bridge.map(item => <div className={item.kind.toLowerCase()} key={item.id}><span>{item.label}</span><i><b style={{ width: `${Math.abs(item.value) / bridgeMax * 100}%` }} /></i><strong className={item.value < 0 ? 'bad-text' : item.kind === 'RESULT' ? 'good-text' : ''}>{formatMoney(item.value)}</strong></div>)}</div></section><section><div className="section-label"><span>Fee audit</span><small>Order-associated deductions and reversals</small></div><div className="inline-fee-grid">{audit.feeGroups.length ? audit.feeGroups.map(item => <div key={item.label}><span>{item.label}</span><strong>{formatMoney(item.value)}</strong></div>) : <p>No order-level fees found.</p>}</div></section></div>
    <section className="inline-timeline"><div className="section-label"><span>Transaction timeline</span><small>Running balance includes operating events only</small></div><div className="table-scroll"><table><thead><tr><th>Posted date/time</th><th>Source label</th><th>Classification</th><th>Amount</th><th>Running balance</th></tr></thead><tbody>{audit.timeline.map(item => <tr key={item.id}><td>{item.date ?? '—'}</td><td>{item.rawLabel}</td><td>{item.event} · {item.amountType}{!item.classified ? <small className="bad-text">Needs review</small> : null}</td><td className={item.amount < 0 ? 'bad-text' : 'good-text'}>{formatMoney(item.amount)}</td><td>{formatMoney(item.runningBalance)}</td></tr>)}</tbody></table></div></section>
  </div>
}
