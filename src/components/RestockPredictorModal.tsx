import { useState } from 'react'
import type { SkuRestockStatus } from '../core/inventory/restockPredictor'

interface Props {
  readonly restockList: readonly SkuRestockStatus[]
  readonly onClose: () => void
}

export function RestockPredictorModal({ restockList, onClose }: Props) {
  const [filter, setFilter] = useState<'ALL' | 'CRITICAL'>('ALL')
  const [search, setSearch] = useState('')

  const criticalCount = restockList.filter(item => item.urgency === 'OUT_OF_STOCK' || item.urgency === 'REORDER_NOW').length

  const filtered = restockList.filter(item => {
    if (filter === 'CRITICAL' && item.urgency !== 'OUT_OF_STOCK' && item.urgency !== 'REORDER_NOW') return false
    if (search && !item.sku.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="audit-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="restock-title">
      <div className="audit-modal" style={{ maxWidth: 880 }}>
        <div className="audit-modal-head">
          <div>
            <h2 id="restock-title">Inventory Restock & Velocity Predictor</h2>
            <p style={{ margin: '4px 0', fontSize: 13, color: 'var(--muted)' }}>
              Track sales velocity, days of stock remaining, and prevent costly stockouts.
            </p>
          </div>
          <button className="text-btn" onClick={onClose} aria-label="Close dialog">✕</button>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '14px 0', flexWrap: 'wrap' }}>
          <input
            type="search"
            placeholder="Search SKU…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 240 }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className={`choice-button ${filter === 'ALL' ? 'active' : ''}`}
              onClick={() => setFilter('ALL')}
            >
              All items ({restockList.length})
            </button>
            <button
              className={`choice-button ${filter === 'CRITICAL' ? 'active' : ''}`}
              onClick={() => setFilter('CRITICAL')}
            >
              Critical / Reorder ({criticalCount})
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto', maxHeight: '55vh' }}>
          <table className="audit-table" style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Stock</th>
                <th>Daily Velocity</th>
                <th>Runway</th>
                <th>Status</th>
                <th>Est. Stockout</th>
                <th>Reorder Qty</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const badgeColor =
                  item.urgency === 'OUT_OF_STOCK'
                    ? '#f87171'
                    : item.urgency === 'REORDER_NOW'
                    ? '#f97316'
                    : item.urgency === 'REORDER_SOON'
                    ? '#fbbf24'
                    : '#4ade80'

                return (
                  <tr key={item.sku}>
                    <td style={{ fontWeight: 600 }}>{item.sku}</td>
                    <td>{item.currentStock.toLocaleString('en-IN')}</td>
                    <td>{item.activeVelocity} / day</td>
                    <td style={{ fontWeight: 600 }}>
                      {item.daysOfStock >= 999 ? '99+ days' : `${item.daysOfStock} days`}
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: `${badgeColor}22`,
                          color: badgeColor,
                          textTransform: 'uppercase',
                        }}
                      >
                        {item.urgency.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>{item.estimatedStockoutDate ?? '—'}</td>
                    <td style={{ fontWeight: 600, color: item.recommendedReorderQty > 0 ? 'var(--accent, #d4a373)' : 'inherit' }}>
                      {item.recommendedReorderQty > 0 ? `+${item.recommendedReorderQty.toLocaleString('en-IN')}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="audit-modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
