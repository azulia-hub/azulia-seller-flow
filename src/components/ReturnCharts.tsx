import { useState } from 'react'
import { summarizeReturns, type ReturnTrendPoint } from '../core/analytics/returnSummary'

type Summary = ReturnType<typeof summarizeReturns>

export function ReturnTrendChart({ data }: { data: readonly ReturnTrendPoint[] }) {
  const width = 720, height = 210, pad = 28
  const max = Math.max(1, ...data.flatMap((point) => [point.returnedQuantity, point.rtoQuantity, point.customerReturnQuantity]))
  const points = (key: 'returnedQuantity' | 'rtoQuantity' | 'customerReturnQuantity') => data.map((point, index) => `${pad + index * (width - pad * 2) / Math.max(1, data.length - 1)},${height - pad - point[key] / max * (height - pad * 2)}`).join(' ')
  return <div className="return-trend-chart">{!data.length ? <p className="empty-state">No dated return activity in this selection.</p> : <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Return volume trend"><line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} /><polyline className="all" points={points('returnedQuantity')} /><polyline className="rto" points={points('rtoQuantity')} /><polyline className="customer" points={points('customerReturnQuantity')} /></svg>}<div className="trend-axis"><span>{data[0]?.period ?? ''}</span><span>{data.at(-1)?.period ?? ''}</span></div></div>
}

export function ReturnCharts({ summary }: { summary: Summary }) {
  const [grain, setGrain] = useState<'DAY' | 'WEEK'>('WEEK')
  const trend = grain === 'DAY' ? summary.dailyTrend : summary.weeklyTrend
  const donutStyle = { background: `conic-gradient(#ff9b5f 0 ${summary.rtoShare}%, #ff6b7a ${summary.rtoShare}% ${summary.rtoShare + summary.customerReturnShare}%, #71819b ${summary.rtoShare + summary.customerReturnShare}% 100%)` }
  const lossMax = Math.max(1, summary.rtoLoss, summary.customerReturnLoss, summary.unknownReturnLoss)
  return <><section className="return-chart-grid">
    <div className="panel return-donut-card"><div className="panel-head"><div><small>Return mix</small><h3>RTO vs customer returns</h3></div></div><div className="return-donut-wrap"><div className="return-donut" style={donutStyle}><div><strong>{summary.totalQuantity}</strong><span>units</span></div></div><div className="return-donut-legend"><div className="rto"><span>RTO</span><strong>{summary.rtoShare.toFixed(1)}%</strong><small>{summary.rtoQuantity} units</small></div><div className="customer"><span>Customer returns</span><strong>{summary.customerReturnShare.toFixed(1)}%</strong><small>{summary.customerReturnQuantity} units</small></div>{summary.unknownQuantity ? <div className="unknown"><span>Unknown</span><strong>{summary.unknownShare.toFixed(1)}%</strong><small>{summary.unknownQuantity} units</small></div> : null}</div></div></div>
    <div className="panel"><div className="panel-head"><div><small>Financial impact</small><h3>Loss after recovery</h3><p>Refund-side cash impact after recovered COGS and reimbursements.</p></div></div><div className="impact-bars">{[['RTO', summary.rtoLoss, 'rto'], ['Customer return', summary.customerReturnLoss, 'customer'], ['Unknown', summary.unknownReturnLoss, 'unknown']].map(([label, value, tone]) => <div key={label}><span>{label}</span><div><i className={String(tone)} style={{ width: `${Number(value) / lossMax * 100}%` }} /></div><strong>₹{Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</strong></div>)}</div></div>
  </section><section className="panel trend-panel"><div className="panel-head"><div><small>Return trend</small><h3>Overall, RTO and customer-return units</h3></div><div className="segmented"><button className={grain === 'DAY' ? 'active' : ''} onClick={() => setGrain('DAY')}>Daily</button><button className={grain === 'WEEK' ? 'active' : ''} onClick={() => setGrain('WEEK')}>Weekly</button></div></div><div className="return-stack-legend"><span className="unknown">Overall</span><span className="rto">RTO</span><span className="customer">Customer</span></div><ReturnTrendChart data={trend} /></section></>
}
