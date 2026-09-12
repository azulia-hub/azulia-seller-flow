import type { SkuTrendPoint } from '../core/analytics/orderProfit'

export function SkuTrendChart({ data, formatMoney }: { data: readonly SkuTrendPoint[]; formatMoney: (value: number) => string }) {
  const width = 600, height = 190, pad = 18
  const values = data.flatMap((point) => [point.grossSales, point.profit])
  const min = Math.min(0, ...values), max = Math.max(1, ...values), range = max - min || 1
  const x = (index: number) => data.length < 2 ? width / 2 : pad + index * (width - pad * 2) / (data.length - 1)
  const y = (value: number) => pad + (max - value) / range * (height - pad * 2)
  const points = (key: 'grossSales' | 'profit') => data.map((point, index) => `${x(index)},${y(point[key])}`).join(' ')
  return <div className="sku-trend-card"><div className="sku-chart-head"><div><small>Performance over time</small><h3>Sales and profit trend</h3></div><div className="sku-chart-legend"><span className="sales">Sales</span><span className="profit">Profit</span></div></div>
    {!data.length ? <p className="empty-state">No dated activity for this SKU.</p> : <><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Daily gross sales and profit trend"><line x1={pad} y1={y(0)} x2={width - pad} y2={y(0)} className="zero-line" /><polyline points={points('grossSales')} className="sku-sales-line" /><polyline points={points('profit')} className="sku-profit-line" />{data.map((point, index) => <g key={point.date}><circle cx={x(index)} cy={y(point.grossSales)} r="3" className="sales-dot"><title>{point.date}: Sales {formatMoney(point.grossSales)}</title></circle><circle cx={x(index)} cy={y(point.profit)} r="3" className="profit-dot"><title>{point.date}: Profit {formatMoney(point.profit)}</title></circle></g>)}</svg><div className="sku-chart-axis"><span>{data[0].date}</span><span>{data.at(-1)?.date}</span></div></>}
  </div>
}
