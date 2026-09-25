import { useState } from 'react'
import '../styles/interactiveCharts.css'

export type InteractiveChartSeries = { readonly id: string; readonly label: string; readonly values: readonly number[]; readonly color: string }
type Props = { readonly labels: readonly string[]; readonly series: readonly InteractiveChartSeries[]; readonly formatValue: (value: number) => string; readonly ariaLabel: string; readonly onSelectPoint?: (label: string, index: number) => void }

export function InteractiveLineChart({ labels, series, formatValue, ariaLabel, onSelectPoint }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [hiddenSeries, setHiddenSeries] = useState<readonly string[]>([])
  const visibleSeries = series.filter(item => !hiddenSeries.includes(item.id))
  const width = 600, height = 210, left = 24, right = 12, top = 18, bottom = 25
  const values = visibleSeries.flatMap(item => item.values)
  const minimum = Math.min(0, ...values), maximum = Math.max(1, ...values), range = maximum - minimum || 1
  const x = (index: number) => labels.length < 2 ? width / 2 : left + index * (width - left - right) / (labels.length - 1)
  const y = (value: number) => top + (maximum - value) / range * (height - top - bottom)
  const nearestIndex = (clientX: number, target: SVGSVGElement) => {
    const bounds = target.getBoundingClientRect(), chartX = (clientX - bounds.left) / Math.max(1, bounds.width) * width
    return labels.reduce((best, _, index) => Math.abs(x(index) - chartX) < Math.abs(x(best) - chartX) ? index : best, 0)
  }
  const select = (index: number) => onSelectPoint?.(labels[index], index)
  if (!labels.length || !series.length) return null
  return <div className={`interactive-chart ${onSelectPoint ? 'is-clickable' : ''}`} onMouseLeave={() => setActiveIndex(null)}>
    {series.length > 1 ? <div className="interactive-legend" aria-label="Chart series">{series.map(item => { const hidden = hiddenSeries.includes(item.id); return <button key={item.id} className={hidden ? 'is-hidden' : ''} aria-pressed={!hidden} onClick={() => setHiddenSeries(current => hidden ? current.filter(id => id !== item.id) : visibleSeries.length > 1 ? [...current, item.id] : current)}><i style={{ background: item.color }} />{item.label}</button> })}</div> : null}
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} onPointerMove={event => setActiveIndex(nearestIndex(event.clientX, event.currentTarget))} onClick={event => { if (onSelectPoint) select(nearestIndex(event.clientX, event.currentTarget)) }}>
      {[.25, .5, .75].map(ratio => <line key={ratio} x1={left} y1={top + ratio * (height - top - bottom)} x2={width - right} y2={top + ratio * (height - top - bottom)} className="interactive-grid" />)}
      <line x1={left} y1={y(0)} x2={width - right} y2={y(0)} className="interactive-zero" />
      {visibleSeries.map(item => <polyline key={item.id} pathLength={1} points={item.values.map((value, index) => `${x(index)},${y(value)}`).join(' ')} fill="none" stroke={item.color} className="interactive-series" />)}
      {activeIndex !== null ? <><line x1={x(activeIndex)} y1={top} x2={x(activeIndex)} y2={height - bottom} className="interactive-guide" />{visibleSeries.map(item => <circle key={item.id} cx={x(activeIndex)} cy={y(item.values[activeIndex] ?? 0)} r="4" fill={item.color} className="interactive-active-dot" />)}</> : null}
      {labels.map((label, index) => <circle key={`${label}-${index}`} cx={x(index)} cy={y(visibleSeries[0].values[index] ?? 0)} r="7" className="interactive-hit-point" tabIndex={0} role={onSelectPoint ? 'button' : undefined} aria-label={`${label}. ${visibleSeries.map(item => `${item.label} ${formatValue(item.values[index] ?? 0)}`).join(', ')}`} onFocus={() => setActiveIndex(index)} onBlur={() => setActiveIndex(null)} onKeyDown={event => { if (onSelectPoint && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); select(index) } }} />)}
    </svg>
    {activeIndex !== null ? <div className="interactive-tooltip" style={{ left: `${x(activeIndex) / width * 100}%`, transform: activeIndex === 0 ? 'none' : activeIndex === labels.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }} role="status"><strong>{labels[activeIndex]}</strong>{visibleSeries.map(item => <span key={item.id}><i style={{ background: item.color }} />{item.label}<b>{formatValue(item.values[activeIndex] ?? 0)}</b></span>)}{onSelectPoint ? <small>Click to investigate</small> : null}</div> : null}
  </div>
}
