import type { SkuTrendPoint } from '../core/analytics/orderProfit'
import { InteractiveLineChart } from './InteractiveLineChart'

export function SkuTrendChart({ data, formatMoney }: { data: readonly SkuTrendPoint[]; formatMoney: (value: number) => string }) {
  return <div className="sku-trend-card"><div className="sku-chart-head"><div><small>Performance over time</small><h3>Sales and profit trend</h3></div></div>
    {!data.length ? <p className="empty-state">No dated activity for this SKU.</p> : <><InteractiveLineChart labels={data.map(point => point.date)} series={[{ id: 'sales', label: 'Sales', values: data.map(point => point.grossSales), color: '#7d8cff' }, { id: 'profit', label: 'Profit', values: data.map(point => point.profit), color: '#4dd4a7' }]} formatValue={formatMoney} ariaLabel="Daily gross sales and profit trend. Hover or focus a point for details." /><div className="sku-chart-axis"><span>{data[0].date}</span><span>{data.at(-1)?.date}</span></div></>}
  </div>
}
