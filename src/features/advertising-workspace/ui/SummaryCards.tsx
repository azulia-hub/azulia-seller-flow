import { useState } from 'react'
import type { AdvertisingSummaryMetric } from '../contract'
import { formatChange, formatMetricValue } from './formatters'

interface SummaryCardsProps {
  readonly metrics: readonly AdvertisingSummaryMetric[]
  readonly formatMoney: (n: number) => string
}

export function SummaryCards({ metrics, formatMoney }: SummaryCardsProps) {
  const [openDef, setOpenDef] = useState<string | null>(null)

  return (
    <section className="adsw-summary-grid" aria-label="Primary advertising metrics">
      {metrics.map(metric => {
        const valStr = formatMetricValue(metric.value, metric.format, formatMoney)
        const changeStr = formatChange(metric.change)
        const isFavorable = metric.change?.favorable === true
        const isUnfavorable = metric.change?.favorable === false
        const isDefOpen = openDef === metric.id

        return (
          <div key={metric.id} className="adsw-metric-card" data-testid={`metric-card-${metric.id}`}>
            <div className="adsw-metric-card-top">
              <span className="adsw-metric-title">{metric.label}</span>
              {metric.definition ? (
                <button
                  type="button"
                  className="adsw-metric-def-toggle"
                  aria-label={`Definition for ${metric.label}`}
                  aria-expanded={isDefOpen}
                  onClick={() => setOpenDef(current => (current === metric.id ? null : metric.id))}
                >
                  ℹ
                </button>
              ) : null}
            </div>

            <div>
              <div className="adsw-metric-val">{valStr}</div>
              {metric.unavailableReason ? (
                <div className="adsw-metric-unavail" title={metric.unavailableReason}>
                  {metric.unavailableReason}
                </div>
              ) : null}
            </div>

            <div className="adsw-metric-card-bottom">
              {metric.change ? (
                <span
                  className={`adsw-metric-change ${isFavorable ? 'is-favorable' : ''} ${isUnfavorable ? 'is-unfavorable' : ''}`}
                >
                  {changeStr}
                </span>
              ) : null}
            </div>

            {isDefOpen && metric.definition ? (
              <div className="adsw-metric-def-text">{metric.definition}</div>
            ) : null}
          </div>
        )
      })}
    </section>
  )
}
