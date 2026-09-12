interface BridgeItem { readonly label: string; readonly value: number; readonly kind: 'income' | 'cost' | 'adjustment' }

export function ProfitBridge({ items, profit, format }: { readonly items: readonly BridgeItem[]; readonly profit: number; readonly format: (value: number) => string }) {
  const max = Math.max(1, ...items.map((item) => Math.abs(item.value)))
  return <section className="panel profit-bridge">
    <div className="panel-head"><div><small>Profit bridge</small><h3>Where the money went</h3><p>Tax-inclusive view · settlements excluded</p></div><strong className={profit >= 0 ? 'good-text' : 'bad-text'}>{format(profit)}</strong></div>
    <div className="bridge-list">{items.map((item) => <div className={`bridge-row ${item.kind}`} key={item.label}><span>{item.label}</span><div className="bridge-track"><i style={{ width: `${Math.abs(item.value) / max * 100}%` }} /></div><strong>{item.value > 0 ? '+' : ''}{format(item.value)}</strong></div>)}</div>
  </section>
}
