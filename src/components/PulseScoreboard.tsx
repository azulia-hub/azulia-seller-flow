import type { PulseScoreboard as PulseData } from '../core/analytics/pulseScoreboard'

interface Props {
  readonly scoreboard: PulseData
  readonly onSelectPeriod?: (from: string, to: string) => void
}

function formatInr(value: number): string {
  const rounded = Math.round(value)
  const isNegative = rounded < 0
  const abs = Math.abs(rounded)
  return `${isNegative ? '-' : ''}₹${abs.toLocaleString('en-IN')}`
}

export function PulseScoreboard({ scoreboard, onSelectPeriod }: Props) {
  const periods = [
    scoreboard.today,
    scoreboard.yesterday,
    scoreboard.thisMonth,
    scoreboard.forecast,
  ]

  return (
    <section className="pulse-scoreboard-container" aria-label="Sales and profit scoreboard">
      <div className="pulse-scoreboard-grid">
        {periods.map(period => {
          const isProfitable = period.netProfit >= 0
          const isClickable = Boolean(onSelectPeriod && period.label !== 'Month Forecast')

          return (
            <article
              key={period.label}
              className={`panel pulse-card ${isClickable ? 'clickable' : ''}`}
              onClick={() => {
                if (isClickable && onSelectPeriod) {
                  onSelectPeriod(period.from, period.to)
                }
              }}
              tabIndex={isClickable ? 0 : undefined}
              role={isClickable ? 'button' : undefined}
              onKeyDown={event => {
                if (isClickable && onSelectPeriod && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault()
                  onSelectPeriod(period.from, period.to)
                }
              }}
            >
              <div className="pulse-card-header">
                <span className="pulse-card-title">{period.label}</span>
                {period.label === 'Month Forecast' ? (
                  <span className="pulse-badge-projection">Projected</span>
                ) : (
                  <span className="pulse-card-date">{period.from === period.to ? period.from : `${period.from.slice(5)} to ${period.to.slice(5)}`}</span>
                )}
              </div>

              <div className="pulse-card-body">
                <div className="pulse-metric-primary">
                  <small className="pulse-metric-label">Sales</small>
                  <strong className="pulse-metric-value">
                    {period.grossSales > 0 ? (
                      <>
                        {formatInr(period.grossSales)}
                        {period.pendingSales > 0 ? (
                          <span
                            className="pulse-pending-pill"
                            title={`${formatInr(period.pendingSales)} awaiting Amazon financial settlement`}
                          >
                            +{formatInr(period.pendingSales)} pend.
                          </span>
                        ) : null}
                      </>
                    ) : period.pendingSales > 0 ? (
                      <>
                        {formatInr(period.pendingSales)}
                        <span
                          className="pulse-pending-pill"
                          title="Customer order received; awaiting Amazon shipment & financial posting"
                        >
                          pending
                        </span>
                      </>
                    ) : (
                      formatInr(0)
                    )}
                  </strong>
                </div>

                <div className="pulse-metric-secondary">
                  <small className="pulse-metric-label">Profit</small>
                  {period.grossSales > 0 ? (
                    <strong className={`pulse-profit-value ${isProfitable ? 'good' : 'bad'}`}>
                      {formatInr(period.netProfit)}
                      <span className="pulse-margin-pill">{period.profitMargin}%</span>
                    </strong>
                  ) : period.pendingSales > 0 ? (
                    <strong className="pulse-profit-value neutral">
                      <span
                        className="pulse-pending-profit"
                        title="Final profit calculated after Amazon ships and posts settlement fees"
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
                <span>{period.ordersCount} orders</span>
                {period.pendingOrdersCount > 0 ? (
                  <span
                    className="pulse-pending-note"
                    title={`${period.pendingOrdersCount} orders placed awaiting Amazon shipment`}
                  >
                    ({period.pendingOrdersCount} pending)
                  </span>
                ) : null}
                <span>·</span>
                <span>{period.unitsSold} units</span>
                {period.returnUnits > 0 ? (
                  <>
                    <span>·</span>
                    <span className="pulse-return-units">{period.returnUnits} returned</span>
                  </>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
