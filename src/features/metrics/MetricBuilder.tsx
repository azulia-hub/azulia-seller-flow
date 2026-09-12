import { useState } from 'react'

export function MetricBuilder({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<'percentage' | 'formula'>('percentage')
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal metric-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><div><small>Metric studio</small><h2>Create a metric</h2><p>No code. Build calculations from your existing fields and metrics.</p></div><button className="close" onClick={onClose}>×</button></div>
        <div className="segmented">
          <button className={kind === 'percentage' ? 'active' : ''} onClick={() => setKind('percentage')}>Percentage</button>
          <button className={kind === 'formula' ? 'active' : ''} onClick={() => setKind('formula')}>Formula</button>
        </div>
        <div className="form-grid">
          <label><span>Metric name</span><input defaultValue="Shipping %" /></label>
          <label><span>Format</span><select defaultValue="percent"><option value="percent">Percentage</option><option>Currency</option><option>Number</option></select></label>
        </div>
        <div className="formula-canvas">
          <select defaultValue="Easy Ship"><option>Easy Ship</option><option>Ads Spend</option><option>Profit After Ads</option></select>
          <span className="operator">÷</span>
          <select defaultValue="Gross Sales"><option>Gross Sales</option><option>Net Revenue</option><option>COGS</option></select>
          <span className="operator">× 100</span>
        </div>
        <div className="preview-box"><span>Preview on current dataset</span><strong>22.23%</strong><small>Easy Ship ₹112,409 ÷ Gross Sales ₹505,619</small></div>
        <div className="modal-actions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={onClose}>Save metric</button></div>
      </section>
    </div>
  )
}
