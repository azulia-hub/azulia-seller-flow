import { InteractiveLineChart } from './InteractiveLineChart'

export function LineChart({ data = [], onSelectPoint }: { readonly data?: readonly { label: string; value: number }[]; readonly onSelectPoint?: (label: string) => void }) {
  if (!data.length) return <div className="chart-shell"><div className="chart-head"><div><small>Performance trend</small><h3>Gross sales</h3></div></div><p className="empty-state">Import and normalize data to see a trend.</p></div>

  return (
    <div className="chart-shell">
      <div className="chart-head">
        <div><small>Performance trend</small><h3>Gross sales</h3></div>
        <div className="legend"><span className="legend-dot revenue"/>Sales</div>
      </div>
      <InteractiveLineChart labels={data.map(item => item.label)} series={[{ id: 'sales', label: 'Gross sales', values: data.map(item => item.value), color: '#7d8cff' }]} formatValue={value => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} ariaLabel="Gross sales trend. Hover or focus a point for details." onSelectPoint={onSelectPoint ? label => onSelectPoint(label) : undefined} />
      <div className="chart-axis"><span>{data[0]?.label}</span><span>{data.at(-1)?.label}</span></div>
    </div>
  )
}
