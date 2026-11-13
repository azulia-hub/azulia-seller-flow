import { useState } from 'react'
import { formatMoney } from '../adapters/preferences/runtime'
import type { PulseScoreboard as PulseData, PulsePeriodMetrics } from '../core/analytics/pulseScoreboard'
import { PulseOrdersModal } from './PulseOrdersModal'

interface Props {
  readonly scoreboard: PulseData
  readonly onRequestDetails?: (ids: readonly string[], range: { from: string; to: string }) => void
  readonly onSelectPeriod?: (from: string, to: string) => void
}

function formatInr(value: number): string { return formatMoney(value) }

export function PulseScoreboard({ scoreboard, onSelectPeriod, onRequestDetails }: Props) {
  const [modalLabel, setModalLabel] = useState<string | null>(null)

  const periods = [
    scoreboard.today,
    scoreboard.yesterday,
    scoreboard.thisMonth,
    scoreboard.forecast,
  ]

  const modalPeriod = periods.find(period => period.label === modalLabel) ?? null

  const handleCardClick = (period: PulsePeriodMetrics) => {
    if (period.label === 'Month Forecast') {
      if (onSelectPeriod) onSelectPeriod(period.from, period.to)
    } else {
      setModalLabel(period.label)
      onRequestDetails?.(period.orders.map(order => order.orderId), { from: period.from, to: period.to })
    }
  }

  return (
    <>
      <section className="pulse-scoreboard-container" aria-label="Sales and profit scoreboard">
        <div className="pulse-scoreboard-grid">
          {periods.map(period => {
            const isProfitable = period.netProfit >= 0
            const isForecast = period.label === 'Month Forecast'

            return (
              <article
                key={period.label}
                className="panel pulse-card clickable"
                onClick={() => handleCardClick(period)}
                tabIndex={0}
                role="button"
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    handleCardClick(period)
                  }
                }}
              >
                <div className="pulse-card-header">
                  <span className="pulse-card-title">{period.label}</span>
                  {isForecast ? (
                    <span className="pulse-badge-projection">Projected</span>
                  ) : (
                    <span className="pulse-card-date">
                      {period.from === period.to ? period.from : `${period.from.slice(5)} to ${period.to.slice(5)}`}
                      {period.isPartialCoverage ? (
                        <span className="pulse-badge-partial" title="Data for this period is partially synced or missing older days" style={{ marginLeft: 6, fontSize: 10, color: '#f59e0b', border: '1px solid #f59e0b', borderRadius: 4, padding: '1px 4px' }}>
                          partial
                        </span>
                      ) : null}
                    </span>
                  )}
                </div>

                <div className="pulse-card-body">
                  <div className="pulse-metric-primary">
                    <small className="pulse-metric-label">Sales (Total)</small>
                    <strong className="pulse-metric-value">
                      {formatInr(period.totalSales)}
                    </strong>
                    {/* Subtitle breakdown for settled vs pending */}
                    {period.pendingSales > 0 && period.grossSales > 0 ? (
                      <div className="pulse-breakdown-sub" title={`Settled: ${formatInr(period.grossSales)} | Pending: ${formatInr(period.pendingSales)}`}>
                        <small>{formatInr(period.grossSales)} set. · {formatInr(period.pendingSales)} pend.</small>
                      </div>
                    ) : period.grossSales === 0 && period.pendingSales > 0 ? (
                      <div className="pulse-breakdown-sub">
                        <small className="pulse-pending-pill">all pending / unshipped</small>
                      </div>
                    ) : period.totalSales > 0 && !isForecast ? (
                      <div className="pulse-breakdown-sub">
                        <small style={{ color: 'var(--muted)', fontSize: 10 }}>all settled</small>
                      </div>
                    ) : null}
                  </div>

                  <div className="pulse-metric-secondary">
                    <small className="pulse-metric-label">Profit</small>
                    {period.grossSales > 0 && period.profitReady ? (
                      <strong className={`pulse-profit-value ${isProfitable ? 'good' : 'bad'}`}>
                        {formatInr(period.netProfit)}
                        <span className="pulse-margin-pill">{period.profitMargin}%</span>
                      </strong>
                    ) : period.pendingSales > 0 ? (
                      <strong className="pulse-profit-value neutral">
                        <span
                          className="pulse-pending-profit"
                          title="Profit requires recorded financial activity and product costs"
                        >
                          Awaiting shipment
                        </span>
                      </strong>
                    ) : (
                      <strong className="pulse-profit-value neutral">
                        ₹0
                        <span className="pulse-margin-pill">0%</span>
                      </strong>
                    )}
                  </div>
                </div>

                <div className="pulse-card-footer">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span>{period.ordersCount} orders</span>
                    {period.unshippedOrdersCount > 0 || period.pendingOrdersCount > 0 ? (
                      <span
                        className="pulse-pending-note"
                        title={`${period.confirmedOrdersCount} confirmed/shipped · ${period.unshippedOrdersCount} unshipped · ${period.pendingOrdersCount} pending`}
                      >
                        ({period.confirmedOrdersCount > 0 ? `${period.confirmedOrdersCount} conf. · ` : ''}{period.unshippedOrdersCount > 0 ? `${period.unshippedOrdersCount} unshipped` : ''}{period.unshippedOrdersCount > 0 && period.pendingOrdersCount > 0 ? ' · ' : ''}{period.pendingOrdersCount > 0 ? `${period.pendingOrdersCount} pend.` : ''})
                      </span>
                    ) : null}
                    <span>·</span>
                    <span>{period.unitsSold} units</span>
                    {period.returnUnits > 0 ? (
                      <>
                        <span>·</span>
                        <span className="pulse-return-units">{period.returnUnits} ret.</span>
                      </>
                    ) : null}
                  </div>
                  {!isForecast ? (
                    <span className="pulse-view-orders-link">Orders →</span>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {modalPeriod ? (
        <PulseOrdersModal
          period={modalPeriod}
          onClose={() => { setModalLabel(null); onRequestDetails?.([], { from: modalPeriod.from, to: modalPeriod.to }) }}
          onFilterDashboard={onSelectPeriod}
        />
      ) : null}
    </>
  )
}
