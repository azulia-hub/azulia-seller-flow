export function LineChart({ data = [] }: { readonly data?: readonly { label: string; value: number }[] }) {
  const points = data.map((item) => item.value)
  if (!points.length) return <div className="chart-shell"><div className="chart-head"><div><small>Performance trend</small><h3>Gross sales</h3></div></div><p className="empty-state">Import and normalize data to see a trend.</p></div>
  const max = Math.max(...points)
  const min = Math.min(...points)
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * 100
    const y = max === min ? 55 : 90 - ((p - min) / (max - min)) * 70
    return `${x},${y}`
  }).join(' ')

  return (
    <div className="chart-shell">
      <div className="chart-head">
        <div><small>Performance trend</small><h3>Gross sales</h3></div>
        <div className="legend"><span className="legend-dot revenue"/>Sales</div>
      </div>
      <svg className="line-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Revenue trend chart">
        {[20,40,60,80].map(y => <line key={y} x1="0" y1={y} x2="100" y2={y} className="grid-line" />)}
        <polyline points={coords} className="area-line" />
      </svg>
      <div className="chart-axis"><span>{data[0]?.label}</span><span>{data.at(-1)?.label}</span></div>
    </div>
  )
}
