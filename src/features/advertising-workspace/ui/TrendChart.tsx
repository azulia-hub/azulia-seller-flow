import { useState } from 'react'
import type { AdvertisingTrendPoint } from '../contract'
import { formatPercent, formatMultiplier, formatInteger } from './formatters'

interface TrendChartProps {
  readonly trend: readonly AdvertisingTrendPoint[]
  readonly formatMoney: (n: number) => string
}

type TrendPerspective = 'spend_sales' | 'efficiency' | 'traffic'

export function TrendChart({ trend, formatMoney }: TrendChartProps) {
  const [mode, setMode] = useState<TrendPerspective>('spend_sales')
  const [showTable, setShowTable] = useState(false)

  if (!trend || trend.length === 0) {
    return (
      <section className="adsw-trend-card" aria-label="Advertising trend">
        <h3 className="adsw-trend-title">Performance trend</h3>
        <p className="adsw-cell-sub">No trend observations available for this date range.</p>
      </section>
    )
  }

  // Pre-calculate max values for scaling SVG
  let maxA = 0
  let maxB = 0

  for (const point of trend) {
    if (mode === 'spend_sales') {
      maxA = Math.max(maxA, point.metrics.spend ?? 0)
      maxB = Math.max(maxB, point.metrics.attributedSales ?? 0)
    } else if (mode === 'efficiency') {
      maxA = Math.max(maxA, point.metrics.acos ?? 0)
      maxB = Math.max(maxB, point.metrics.roas ?? 0)
    } else {
      maxA = Math.max(maxA, point.metrics.clicks ?? 0)
      maxB = Math.max(maxB, point.metrics.impressions ?? 0)
    }
  }

  const safeMaxA = maxA > 0 ? maxA : 1
  const safeMaxB = maxB > 0 ? maxB : 1

  const width = 800
  const height = 180
  const paddingX = 40
  const paddingY = 24
  const chartW = width - paddingX * 2
  const chartH = height - paddingY * 2

  const n = trend.length
  const step = n > 1 ? chartW / (n - 1) : chartW

  const values = (pt: AdvertisingTrendPoint): [number | null, number | null] => mode === 'spend_sales'
    ? [pt.metrics.spend, pt.metrics.attributedSales]
    : mode === 'efficiency' ? [pt.metrics.acos, pt.metrics.roas] : [pt.metrics.clicks, pt.metrics.impressions]
  const path = (series: 0 | 1, maximum: number) => {
    let connected = false
    return trend.map((pt, idx) => {
      const value = values(pt)[series]
      if (value === null) { connected = false; return '' }
      const command = connected ? 'L' : 'M'; connected = true
      return `${command} ${paddingX + idx * step},${paddingY + chartH - value / maximum * chartH}`
    }).join(' ')
  }
  const pathA = path(0, safeMaxA), pathB = path(1, safeMaxB)

  const labelA =
    mode === 'spend_sales' ? 'Spend' : mode === 'efficiency' ? 'ACOS' : 'Clicks'
  const labelB =
    mode === 'spend_sales' ? 'Attributed Sales' : mode === 'efficiency' ? 'ROAS' : 'Impressions'

  const colorA = '#dec17b'
  const colorB = '#73c5a0'

  return (
    <section className="adsw-trend-card" aria-label="Advertising trend chart">
      <div className="adsw-trend-top">
        <h3 className="adsw-trend-title">Daily performance trend</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="adsw-segmented-control" role="tablist" aria-label="Trend metric selection">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'spend_sales'}
              className={`adsw-segmented-btn ${mode === 'spend_sales' ? 'is-active' : ''}`}
              onClick={() => setMode('spend_sales')}
            >
              Spend &amp; Sales
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'efficiency'}
              className={`adsw-segmented-btn ${mode === 'efficiency' ? 'is-active' : ''}`}
              onClick={() => setMode('efficiency')}
            >
              Efficiency
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'traffic'}
              className={`adsw-segmented-btn ${mode === 'traffic' ? 'is-active' : ''}`}
              onClick={() => setMode('traffic')}
            >
              Traffic
            </button>
          </div>
          <button
            type="button"
            className="adsw-btn adsw-btn-ghost"
            style={{ fontSize: 11 }}
            onClick={() => setShowTable(val => !val)}
            aria-expanded={showTable}
          >
            {showTable ? 'Hide data table' : 'Show data table'}
          </button>
        </div>
      </div>

      <div className="adsw-trend-legend">
        <div className="adsw-legend-item">
          <span className="adsw-legend-color" style={{ background: colorA }} />
          <span>{labelA}</span>
        </div>
        <div className="adsw-legend-item">
          <span className="adsw-legend-color" style={{ background: colorB }} />
          <span>{labelB}</span>
        </div>
      </div>

      <div className="adsw-trend-svg-container">
        <svg
          className="adsw-trend-svg"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Trend chart for ${labelA} and ${labelB}`}
        >
          {/* Grid lines */}
          <line
            x1={paddingX}
            y1={paddingY}
            x2={width - paddingX}
            y2={paddingY}
            stroke="var(--line, #e3ded2)"
            strokeDasharray="3 3"
          />
          <line
            x1={paddingX}
            y1={paddingY + chartH / 2}
            x2={width - paddingX}
            y2={paddingY + chartH / 2}
            stroke="var(--line, #e3ded2)"
            strokeDasharray="3 3"
          />
          <line
            x1={paddingX}
            y1={paddingY + chartH}
            x2={width - paddingX}
            y2={paddingY + chartH}
            stroke="var(--line, #e3ded2)"
          />

          {/* Lines */}
          {pathA ? (
            <path d={pathA} fill="none" stroke={colorA} strokeWidth="2.5" strokeLinecap="round" />
          ) : null}
          {pathB ? (
            <path d={pathB} fill="none" stroke={colorB} strokeWidth="2.5" strokeLinecap="round" />
          ) : null}

          {/* Points */}
          {trend.map((pt, idx) => {
            const x = paddingX + idx * step
            const [valA, valB] = values(pt)
            const yA = valA === null ? null : paddingY + chartH - (valA / safeMaxA) * chartH
            const yB = valB === null ? null : paddingY + chartH - (valB / safeMaxB) * chartH

            return (
              <g key={pt.date}>
                {yA !== null ? <circle cx={x} cy={yA} r="3.5" fill={colorA}><title>{pt.date}: {labelA} {valA}</title></circle> : null}
                {yB !== null ? <circle cx={x} cy={yB} r="3.5" fill={colorB}><title>{pt.date}: {labelB} {valB}</title></circle> : null}
              </g>
            )
          })}
        </svg>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          color: 'var(--muted, #716c60)',
        }}
      >
        <span>{trend[0]?.date}</span>
        {trend.length > 2 ? <span>{trend[Math.floor(trend.length / 2)]?.date}</span> : null}
        <span>{trend[trend.length - 1]?.date}</span>
      </div>

      {showTable ? (
        <div className="adsw-table-wrapper" style={{ marginTop: 12 }}>
          <table className="adsw-table" aria-label="Daily trend data table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="is-numeric">Spend</th>
                <th className="is-numeric">Attributed Sales</th>
                <th className="is-numeric">ACOS</th>
                <th className="is-numeric">ROAS</th>
                <th className="is-numeric">Clicks</th>
                <th className="is-numeric">Impressions</th>
              </tr>
            </thead>
            <tbody>
              {trend.map(pt => (
                <tr key={pt.date}>
                  <td>{pt.date}</td>
                  <td className="is-numeric">{(pt.metrics.spend === null ? '—' : formatMoney(pt.metrics.spend))}</td>
                  <td className="is-numeric">{(pt.metrics.attributedSales === null ? '—' : formatMoney(pt.metrics.attributedSales))}</td>
                  <td className="is-numeric">{formatPercent(pt.metrics.acos)}</td>
                  <td className="is-numeric">{formatMultiplier(pt.metrics.roas)}</td>
                  <td className="is-numeric">{formatInteger(pt.metrics.clicks)}</td>
                  <td className="is-numeric">{formatInteger(pt.metrics.impressions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
