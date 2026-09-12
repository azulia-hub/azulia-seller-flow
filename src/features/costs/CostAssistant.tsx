import { useState } from 'react'

const initial = [
  { sku: 'AZULIA-STAND-30X9', qty: 11, cost: '' },
  { sku: 'AZULIA-MDF-12X18', qty: 24, cost: '' },
  { sku: 'AZULIA-SHOE-RACK', qty: 8, cost: '' },
]

export function CostAssistant() {
  const [items, setItems] = useState(initial)
  const complete = items.filter((item) => Number(item.cost) > 0).length

  return (
    <section className="panel cost-panel">
      <div className="panel-head">
        <div><small>Cost master</small><h3>3 SKUs need cost</h3><p>Complete these to unlock reliable profit metrics.</p></div>
        <span className="status warning">{complete}/{items.length} fixed</span>
      </div>
      <div className="cost-list">
        {items.map((item, index) => (
          <label className="cost-row" key={item.sku}>
            <span><strong>{item.sku}</strong><small>{item.qty} units sold</small></span>
            <div className="money-input"><b>₹</b><input inputMode="decimal" placeholder="0.00" value={item.cost} onChange={(e) => setItems((old) => old.map((v, i) => i === index ? { ...v, cost: e.target.value } : v))}/></div>
          </label>
        ))}
      </div>
      <button className="primary full">Save costs</button>
    </section>
  )
}
