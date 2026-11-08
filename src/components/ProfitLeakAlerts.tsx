import { useState } from 'react'
import type { ProfitLeakAlert } from '../core/insights/profitLeakDetector'

interface Props {
  readonly alerts: readonly ProfitLeakAlert[]
  readonly onSelectSku?: (sku: string) => void
}

export function ProfitLeakAlerts({ alerts, onSelectSku }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  if (!alerts.length) return null

  const criticalCount = alerts.filter(a => a.severity === 'CRITICAL').length
  const warningCount = alerts.filter(a => a.severity === 'WARNING').length

  return (
    <section className="profit-leaks-container" aria-label="Profit leak and anomaly alerts">
      <div className="profit-leaks-header">
        <div className="profit-leaks-title-group">
          <strong>⚡ Profit Leaks & Anomaly Alerts</strong>
          <div className="profit-leaks-badges">
            {criticalCount > 0 ? (
              <span className="badge-critical">{criticalCount} critical</span>
            ) : null}
            {warningCount > 0 ? (
              <span className="badge-warning">{warningCount} warnings</span>
            ) : null}
          </div>
        </div>
        <button
          className="text-btn profit-leaks-toggle"
          onClick={() => setCollapsed(prev => !prev)}
          aria-expanded={!collapsed}
        >
          {collapsed ? `Show alerts (${alerts.length})` : 'Hide alerts'}
        </button>
      </div>

      {!collapsed ? (
        <div className="profit-leaks-list">
          {alerts.slice(0, 10).map(alert => (
            <article
              key={alert.id}
              className={`profit-leak-card severity-${alert.severity.toLowerCase()} ${onSelectSku ? 'clickable' : ''}`}
              onClick={() => onSelectSku?.(alert.sku)}
              role={onSelectSku ? 'button' : undefined}
              tabIndex={onSelectSku ? 0 : undefined}
              onKeyDown={e => {
                if (onSelectSku && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  onSelectSku(alert.sku)
                }
              }}
            >
              <div className="profit-leak-card-top">
                <span className={`profit-leak-badge ${alert.severity.toLowerCase()}`}>
                  {alert.severity}
                </span>
                <strong className="profit-leak-title">{alert.title}</strong>
                <span className="profit-leak-delta">{alert.metricDelta}</span>
              </div>
              <p className="profit-leak-desc">{alert.description}</p>
              <div className="profit-leak-footer">
                <small className="profit-leak-rec">💡 {alert.recommendation}</small>
                {onSelectSku ? <span className="profit-leak-action">Investigate SKU →</span> : null}
              </div>
            </article>
          ))}
          {alerts.length > 10 ? (
            <small className="profit-leaks-more">Showing top 10 of {alerts.length} active alerts.</small>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
