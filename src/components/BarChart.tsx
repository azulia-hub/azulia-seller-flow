export function BarChart({ items = [], onSelectSku }: { readonly items?: readonly { sku: string; grossSales: number }[]; readonly onSelectSku?: (sku: string) => void }) {
  const top = items.slice(0, 5)
  const max = Math.max(0, ...top.map((item) => item.grossSales))
  return (
    <div className="chart-shell compact">
      <div className="chart-head"><div><small>Top products</small><h3>Gross sales</h3></div></div>
      <div className="bar-list">
        {!top.length ? <p className="empty-state">No product sales in this selection.</p> : top.map((item) => (
          <div className={`bar-row ${onSelectSku ? 'clickable-bar' : ''}`} key={item.sku} onClick={() => onSelectSku?.(item.sku)} role={onSelectSku ? 'button' : undefined} tabIndex={onSelectSku ? 0 : undefined} onKeyDown={(event) => { if (onSelectSku && (event.key === 'Enter' || event.key === ' ')) onSelectSku(item.sku) }}>
            <span>{item.sku}</span>
            <div className="bar-track"><i style={{ width: `${max ? item.grossSales / max * 100 : 0}%` }} /></div>
            <strong>{Math.round(item.grossSales).toLocaleString('en-IN')}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}
