import { useState, useMemo } from 'react'
import type { PulsePeriodMetrics, PulseOrderSummary, PulseOrderStatusCategory } from '../core/analytics/pulseScoreboard'
import { ProductThumbnail } from './ProductThumbnail'

interface Props {
  readonly period: PulsePeriodMetrics
  readonly onClose: () => void
  readonly onFilterDashboard?: (from: string, to: string) => void
}

function formatInr(value: number): string {
  const rounded = Math.round(value)
  const isNegative = rounded < 0
  const abs = Math.abs(rounded)
  return `${isNegative ? '-' : ''}₹${abs.toLocaleString('en-IN')}`
}

function formatDateTimeIST(dateStr: string): string {
  if (!dateStr) return '—'
  try {
    const timestamp = Date.parse(dateStr)
    if (!Number.isFinite(timestamp)) return dateStr
    // Convert to IST (UTC + 5:30)
    const istDate = new Date(timestamp + 330 * 60000)
    const day = istDate.getUTCDate().toString().padStart(2, '0')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const month = months[istDate.getUTCMonth()]
    const year = istDate.getUTCFullYear()
    let hours = istDate.getUTCHours()
    const minutes = istDate.getUTCMinutes().toString().padStart(2, '0')
    const ampm = hours >= 12 ? 'PM' : 'AM'
    hours = hours % 12 || 12
    return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`
  } catch {
    return dateStr
  }
}

export function PulseOrdersModal({ period, onClose, onFilterDashboard }: Props) {
  const [activeFilter, setActiveFilter] = useState<'ALL' | PulseOrderStatusCategory>('ALL')
  const [channelFilter, setChannelFilter] = useState<'ALL' | 'FBA' | 'FBM'>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const copyToClipboard = (orderId: string) => {
    navigator.clipboard?.writeText(orderId)
    setCopiedId(orderId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const isFbaOrder = (fulfillmentType?: string | null) => {
    const ft = (fulfillmentType || '').toUpperCase()
    return ft === 'AFN' || ft === 'FBA' || ft === 'AMAZON'
  }

  const channelStats = useMemo(() => {
    let fbaOrders = 0
    let fbmOrders = 0
    let fbaSales = 0
    let fbmSales = 0

    for (const order of period.orders) {
      if (isFbaOrder(order.fulfillmentType)) {
        fbaOrders++
        fbaSales += order.orderValue || 0
      } else {
        fbmOrders++
        fbmSales += order.orderValue || 0
      }
    }
    return {
      fbaOrders,
      fbmOrders,
      fbaSales: Math.round(fbaSales * 100) / 100,
      fbmSales: Math.round(fbmSales * 100) / 100,
    }
  }, [period.orders])

  const filteredOrders = useMemo(() => {
    return period.orders.filter(order => {
      if (activeFilter !== 'ALL' && order.statusCategory !== activeFilter) {
        return false
      }
      if (channelFilter === 'FBA' && !isFbaOrder(order.fulfillmentType)) {
        return false
      }
      if (channelFilter === 'FBM' && isFbaOrder(order.fulfillmentType)) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchesId = order.orderId.toLowerCase().includes(q)
        const matchesSku = order.skus.some(s => s.toLowerCase().includes(q))
        const matchesStatus = order.rawStatus.toLowerCase().includes(q)
        const matchesTitle = (order.productTitle || '').toLowerCase().includes(q)
        if (!matchesId && !matchesSku && !matchesStatus && !matchesTitle) return false
      }
      return true
    })
  }, [period.orders, activeFilter, channelFilter, searchQuery])

  const counts = useMemo(() => {
    const list = channelFilter === 'ALL'
      ? period.orders
      : period.orders.filter(o => channelFilter === 'FBA' ? isFbaOrder(o.fulfillmentType) : !isFbaOrder(o.fulfillmentType))

    const all = list.length
    const confirmed = list.filter(o => o.statusCategory === 'CONFIRMED').length
    const unshipped = list.filter(o => o.statusCategory === 'UNSHIPPED').length
    const pending = list.filter(o => o.statusCategory === 'PENDING').length
    const canceled = list.filter(o => o.statusCategory === 'CANCELED').length
    return { all, confirmed, unshipped, pending, canceled }
  }, [period.orders, channelFilter])

  const renderStatusBadge = (order: PulseOrderSummary) => {
    switch (order.statusCategory) {
      case 'CONFIRMED':
        return (
          <span className="pulse-order-badge confirmed" title="Order confirmed and dispatched/delivered">
            <span className="pulse-badge-dot" /> Confirmed / Shipped
          </span>
        )
      case 'UNSHIPPED':
        return (
          <span className="pulse-order-badge unshipped" title="Customer order received; awaiting shipment">
            <span className="pulse-badge-dot" /> Unshipped
          </span>
        )
      case 'PENDING':
        return (
          <span className="pulse-order-badge pending" title="Order pending Amazon authorization or payment verification">
            <span className="pulse-badge-dot" /> Pending
          </span>
        )
      case 'CANCELED':
        return (
          <span className="pulse-order-badge canceled" title="Order was canceled">
            <span className="pulse-badge-dot" /> Canceled
          </span>
        )
    }
  }

  return (
    <div
      className="audit-modal-backdrop pulse-orders-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pulse-orders-title"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="audit-modal pulse-orders-modal" style={{ maxWidth: 960, width: '96vw' }}>
        {/* Header */}
        <div className="audit-modal-head">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 id="pulse-orders-title" style={{ margin: 0, fontSize: 18 }}>
                {period.label} Orders
              </h2>
              <span className="pulse-modal-date-badge">
                {period.from === period.to ? period.from : `${period.from} to ${period.to}`}
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
              Full live classification of customer orders (FBA & FBM) placed in this period.
            </p>
          </div>
          <button className="text-btn" onClick={onClose} aria-label="Close dialog" style={{ fontSize: 18, cursor: 'pointer' }}>
            ✕
          </button>
        </div>

        {/* Top Summary KPI Cards */}
        <div className="pulse-modal-kpi-row">
          <div className="pulse-modal-kpi-card highlight">
            <small>Total Sales (All Orders & GST)</small>
            <strong>{formatInr(period.totalSales)}</strong>
            <span className="pulse-modal-kpi-sub">
              Settled: {formatInr(period.grossSales)} · Pending/Unshipped: {formatInr(period.pendingSales)}
            </span>
          </div>
          <div className="pulse-modal-kpi-card">
            <small>Channel Breakdown</small>
            <strong style={{ fontSize: 14 }}>
              FBA: {formatInr(channelStats.fbaSales)} · FBM: {formatInr(channelStats.fbmSales)}
            </strong>
            <span className="pulse-modal-kpi-sub">
              {channelStats.fbaOrders} FBA · {channelStats.fbmOrders} FBM (Easy Ship)
            </span>
          </div>
          <div className="pulse-modal-kpi-card">
            <small>Confirmed / Shipped</small>
            <strong style={{ color: 'var(--good, #4ade80)' }}>{counts.confirmed}</strong>
            <span className="pulse-modal-kpi-sub">Dispatched & released</span>
          </div>
          <div className="pulse-modal-kpi-card">
            <small>Unshipped / Awaiting</small>
            <strong style={{ color: '#f59e0b' }}>{counts.unshipped}</strong>
            <span className="pulse-modal-kpi-sub">Ready to pack & dispatch</span>
          </div>
          <div className="pulse-modal-kpi-card">
            <small>Pending Authorization</small>
            <strong style={{ color: 'var(--accent, #d4a373)' }}>{counts.pending}</strong>
            <span className="pulse-modal-kpi-sub">Awaiting Amazon verification</span>
          </div>
        </div>

        {/* Channel Segment Toggle + Status Filter Tabs + Search */}
        <div className="pulse-modal-toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Fulfillment Channel Toggle */}
            <div className="pulse-ff-toggle" role="group" aria-label="Filter by fulfillment channel">
              <button
                type="button"
                className={`pulse-ff-btn ${channelFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setChannelFilter('ALL')}
              >
                All Channels
              </button>
              <button
                type="button"
                className={`pulse-ff-btn ${channelFilter === 'FBA' ? 'active' : ''}`}
                onClick={() => setChannelFilter('FBA')}
              >
                FBA ({channelStats.fbaOrders})
              </button>
              <button
                type="button"
                className={`pulse-ff-btn ${channelFilter === 'FBM' ? 'active' : ''}`}
                onClick={() => setChannelFilter('FBM')}
              >
                FBM ({channelStats.fbmOrders})
              </button>
            </div>

            {/* Status Tabs */}
            <div className="pulse-modal-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeFilter === 'ALL'}
                className={`pulse-tab-btn ${activeFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setActiveFilter('ALL')}
              >
                All <span>{counts.all}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeFilter === 'CONFIRMED'}
                className={`pulse-tab-btn ${activeFilter === 'CONFIRMED' ? 'active' : ''}`}
                onClick={() => setActiveFilter('CONFIRMED')}
              >
                Confirmed / Shipped <span>{counts.confirmed}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeFilter === 'UNSHIPPED'}
                className={`pulse-tab-btn ${activeFilter === 'UNSHIPPED' ? 'active' : ''}`}
                onClick={() => setActiveFilter('UNSHIPPED')}
              >
                Unshipped <span>{counts.unshipped}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeFilter === 'PENDING'}
                className={`pulse-tab-btn ${activeFilter === 'PENDING' ? 'active' : ''}`}
                onClick={() => setActiveFilter('PENDING')}
              >
                Pending <span>{counts.pending}</span>
              </button>
              {counts.canceled > 0 ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeFilter === 'CANCELED'}
                  className={`pulse-tab-btn ${activeFilter === 'CANCELED' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('CANCELED')}
                >
                  Canceled <span>{counts.canceled}</span>
                </button>
              ) : null}
            </div>
          </div>

          <div className="pulse-modal-search">
            <input
              type="search"
              placeholder="Search product, SKU, or Order ID..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              aria-label="Filter orders by title, SKU, or ID"
            />
          </div>
        </div>

        {/* Orders Table Container */}
        <div className="pulse-orders-list-scroll">
          {filteredOrders.length === 0 ? (
            <div className="pulse-orders-empty">
              <p>No orders found matching this filter.</p>
            </div>
          ) : (
            <table className="pulse-orders-table">
              <thead>
                <tr>
                  <th>Product & Order ID</th>
                  <th>Placed Date (IST)</th>
                  <th>Classification</th>
                  <th>Channel</th>
                  <th style={{ textAlign: 'right' }}>Order Total</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => {
                  const isFba = isFbaOrder(order.fulfillmentType)
                  const displayTitle = order.productTitle
                    || (order.skus.length ? order.skus.join(', ') : `Amazon ${isFba ? 'FBA' : 'FBM'} Order`)

                  return (
                    <tr key={order.orderId} className={`pulse-order-row ${order.statusCategory.toLowerCase()}`}>
                      {/* Product Name (top) and Order ID (down) */}
                      <td className="pulse-order-product-cell">
                        <div className="pulse-order-product-header">
                          <ProductThumbnail url={order.imageUrl ?? null} />
                          <div className="pulse-order-product-info">
                            <div className="pulse-order-product-name" title={displayTitle}>
                              {displayTitle}
                            </div>
                            <div className="pulse-order-subline">
                              <strong>{order.orderId}</strong>
                              <button
                                type="button"
                                className="copy-order-btn"
                                onClick={() => copyToClipboard(order.orderId)}
                                title="Copy Amazon Order ID"
                              >
                                {copiedId === order.orderId ? '✓ Copied' : 'Copy'}
                              </button>
                              {order.skus.length > 0 ? (
                                <span className="sku-tag" title={order.skus.join(', ')}>
                                  {order.skus.join(', ')}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Placed Date & Time */}
                      <td className="pulse-order-date-cell">
                        <span>{formatDateTimeIST(order.purchaseDate)}</span>
                      </td>

                      {/* Classification & Settlement */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {renderStatusBadge(order)}
                          {order.isSettled ? (
                            <span className="settlement-badge settled" title="Recorded in Amazon Financial Ledger">
                              ✓ Settled in P&L
                            </span>
                          ) : (
                            <span className="settlement-badge awaiting" title="Awaiting Amazon Financial Posting">
                              ⏳ Awaiting Settlement
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Channel Badge */}
                      <td>
                        <span
                          className={`fulfillment-badge ${isFba ? 'fba' : 'fbm'}`}
                          title={isFba ? 'Fulfilled by Amazon (AFN)' : 'Merchant Fulfilled / Easy Ship (MFN)'}
                        >
                          {isFba ? 'FBA' : 'FBM'}
                        </span>
                      </td>

                      {/* Order Value (including pending FBA sale) */}
                      <td className="pulse-order-value-cell" style={{ textAlign: 'right' }}>
                        {order.orderValue > 0 ? (
                          <>
                            <strong>{formatInr(order.orderValue)}</strong>
                            {order.isValueEstimated ? (
                              <div title="Estimated pending order value based on store AOV; Amazon finalizes total upon shipment">
                                <span className="pulse-est-pill">est.</span>
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer */}
        <div className="audit-modal-foot pulse-modal-foot">
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            Showing {filteredOrders.length} of {period.orders.length} orders ({channelStats.fbaOrders} FBA · {channelStats.fbmOrders} FBM)
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {onFilterDashboard ? (
              <button
                type="button"
                className="secondary"
                style={{ fontSize: 12, padding: '7px 12px' }}
                onClick={() => {
                  onFilterDashboard(period.from, period.to)
                  onClose()
                }}
              >
                Filter Dashboard to This Date →
              </button>
            ) : null}
            <button
              type="button"
              className="primary"
              style={{ fontSize: 12, padding: '7px 14px' }}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
