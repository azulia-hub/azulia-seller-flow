import React from 'react'
import type { InventoryPortfolioSummary } from '../../core/inventory/inventoryStatus'

interface Props {
  readonly summary: InventoryPortfolioSummary
}

export const InventorySummaryHeader: React.FC<Props> = ({ summary }) => {
  return (
    <section className="inventory-summary-header" aria-label="Inventory portfolio summary">
      <div className="inventory-summary-grid">
        <div className="inventory-kpi-card">
          <small className="inventory-kpi-label">Sellable Stock</small>
          <strong className="inventory-kpi-value">
            {summary.totalSellableUnits.toLocaleString('en-IN')}
          </strong>
          <span className="inventory-kpi-sub">
            Across {summary.totalSkus} tracked items
          </span>
        </div>

        <div className="inventory-kpi-card">
          <small className="inventory-kpi-label">Inbound Pipeline</small>
          <strong className="inventory-kpi-value">
            {summary.totalInboundUnits.toLocaleString('en-IN')}
          </strong>
          <span className="inventory-kpi-sub">
            Working, shipped &amp; receiving
          </span>
        </div>

        <div className="inventory-kpi-card">
          <small className="inventory-kpi-label">Reserved &amp; Processing</small>
          <strong className="inventory-kpi-value">
            {summary.totalReservedUnits.toLocaleString('en-IN')}
          </strong>
          <span className="inventory-kpi-sub">
            Orders, FC transfers &amp; checks
          </span>
        </div>

        <div className="inventory-kpi-card highlight-attention">
          <small className="inventory-kpi-label">Reorder Attention</small>
          <strong className="inventory-kpi-value warning-text">
            {summary.criticalReorderCount + summary.reorderSoonCount}
          </strong>
          <span className="inventory-kpi-sub">
            {summary.criticalReorderCount} critical · {summary.reorderSoonCount} soon
          </span>
        </div>

        <div className="inventory-kpi-card">
          <small className="inventory-kpi-label">Out of Stock</small>
          <strong
            className={`inventory-kpi-value ${summary.outOfStockCount > 0 ? 'bad-text' : 'good-text'}`}
          >
            {summary.outOfStockCount}
          </strong>
          <span className="inventory-kpi-sub">
            Immediate replenishment required
          </span>
        </div>
      </div>
    </section>
  )
}
