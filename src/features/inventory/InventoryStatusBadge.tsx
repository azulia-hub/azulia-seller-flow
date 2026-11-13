import React from 'react'
import type { ReplenishmentUrgency } from '../../core/inventory/types'
import { getReplenishmentBadgeMeta } from '../../core/inventory/inventoryStatus'

interface Props {
  readonly urgency: ReplenishmentUrgency
  readonly className?: string
}

export const InventoryStatusBadge: React.FC<Props> = ({ urgency, className = '' }) => {
  const meta = getReplenishmentBadgeMeta(urgency)

  const toneClass =
    meta.tone === 'positive'
      ? 'inventory-badge-positive'
      : meta.tone === 'warning'
        ? 'inventory-badge-warning'
        : meta.tone === 'negative'
          ? 'inventory-badge-negative'
          : 'inventory-badge-neutral'

  return (
    <span
      className={`inventory-status-badge ${toneClass} ${className}`.trim()}
      title={meta.description}
      role="status"
      aria-label={`Inventory status: ${meta.label}`}
    >
      <span className="inventory-badge-dot" aria-hidden="true" />
      <span>{meta.label}</span>
    </span>
  )
}
