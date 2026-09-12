import type { ImportComparison, StoredImport } from '../../core/imports/importHistory'

type Props = {
  imports: readonly StoredImport[]
  currentImportId: string | null
  leftId: string
  rightId: string
  comparison: ImportComparison | null
  formatMoney: (value: number) => string
  onLeftChange: (id: string) => void
  onRightChange: (id: string) => void
  onOpen: (item: StoredImport) => void
  embedded?: boolean
}

const metrics: readonly { key: keyof NonNullable<ImportComparison['left']>; label: string; format: 'money' | 'number' | 'percent' }[] = [
  { key: 'grossSales', label: 'Gross sales', format: 'money' },
  { key: 'operatingNet', label: 'After marketplace activity', format: 'money' },
  { key: 'netCogs', label: 'Net COGS', format: 'money' },
  { key: 'profitAfterAds', label: 'Profit after ads', format: 'money' },
  { key: 'adsSpend', label: 'Ads spend', format: 'money' },
  { key: 'marketplaceCharges', label: 'Marketplace charges', format: 'money' },
  { key: 'netEasyShipFee', label: 'Net Easy Ship fee', format: 'money' },
  { key: 'reimbursements', label: 'Reimbursements', format: 'money' },
  { key: 'soldQuantity', label: 'Sold units', format: 'number' },
  { key: 'returnQuantity', label: 'Returned units', format: 'number' },
  { key: 'eventCount', label: 'Transactions processed', format: 'number' },
  { key: 'costCoveragePercent', label: 'Cost coverage', format: 'percent' },
]

export function ImportHistory({ imports, currentImportId, leftId, rightId, comparison, formatMoney, onLeftChange, onRightChange, onOpen, embedded = false }: Props) {
  const byId = new Map(imports.map((item) => [item.id, item]))
  const left = byId.get(leftId), right = byId.get(rightId)
  const display = (value: number, format: 'money' | 'number' | 'percent') => format === 'money' ? formatMoney(value) : format === 'percent' ? `${value.toFixed(1)}%` : value.toLocaleString('en-IN')
  return <>
    {!embedded ? <section className="return-hero"><div><span className="eyebrow">Report history</span><h1>Compare reports without mixing their dates.</h1><p>Every normalized upload is stored in this browser. Comparisons automatically use only the dates shared by both reports.</p></div></section> : null}
    {!imports.length ? <section className="panel import-empty"><h3>No saved imports yet</h3><p>Upload a report and it will appear here automatically.</p></section> : <>
      <section className="import-history-grid">{imports.map((item) => <article className={`panel import-card ${item.id === currentImportId ? 'current' : ''}`} key={item.id}><div className="panel-head"><div><small>{item.dataset.source}</small><h3>{item.fileName}</h3></div>{item.id === currentImportId ? <span className="status active-import">Open</span> : null}</div><div className="import-meta"><span><b>{item.profile.fromDate ?? 'Unknown'}</b> to <b>{item.profile.toDate ?? 'Unknown'}</b></span><span>{item.dataset.quality.sourceRowCount.toLocaleString('en-IN')} rows · {item.profile.orderCount.toLocaleString('en-IN')} orders</span><span>{item.dataset.quality.unclassifiedEventCount} unclassified · {item.dataset.quality.reconciliation.reconciled ? 'Reconciled' : 'Review reconciliation'}</span></div><button className="secondary full" onClick={() => onOpen(item)}>Open this report</button></article>)}</section>
      <section className="panel comparison-panel"><div className="panel-head"><div><small>Same-period comparison</small><h3>Report vs report</h3><p>Use this to audit why an August-only report differs from a January–August report.</p></div></div><div className="comparison-selects"><label>Report A<select value={leftId} onChange={(event) => onLeftChange(event.target.value)}>{imports.map((item) => <option key={item.id} value={item.id}>{item.fileName}</option>)}</select></label><span>vs</span><label>Report B<select value={rightId} onChange={(event) => onRightChange(event.target.value)}>{imports.map((item) => <option key={item.id} value={item.id}>{item.fileName}</option>)}</select></label></div>
      {!comparison || !left || !right ? <p className="empty-state">Choose two saved reports.</p> : !comparison.overlap || !comparison.left || !comparison.right ? <div className="comparison-warning">These reports do not have an overlapping dated period.</div> : <><div className={`overlap-strip ${comparison.identical ? 'reconciled' : 'changed'}`}><strong>{comparison.identical ? 'Reports reconcile for the shared period' : 'Reports contain different snapshots for the shared period'}</strong><span>Compared period: {comparison.overlap.fromDate} to {comparison.overlap.toDate}</span><span>{comparison.matchingEventCount.toLocaleString('en-IN')} matching events · {comparison.leftOnlyEventCount.toLocaleString('en-IN')} only in A · {comparison.rightOnlyEventCount.toLocaleString('en-IN')} only in B</span></div><div className="table-scroll"><table><thead><tr><th>Metric</th><th>{left.fileName}</th><th>{right.fileName}</th><th>A − B</th></tr></thead><tbody>{metrics.map((metric) => <tr key={metric.key}><td><strong>{metric.label}</strong></td><td>{display(comparison.left![metric.key], metric.format)}</td><td>{display(comparison.right![metric.key], metric.format)}</td><td className={(comparison.difference?.[metric.key] ?? 0) === 0 ? 'good-text' : 'warning-text'}>{display(comparison.difference?.[metric.key] ?? 0, metric.format)}</td></tr>)}</tbody></table></div></>}
      </section>
    </>}
  </>
}
