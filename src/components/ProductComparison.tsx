import type { PerformanceChange } from '../core/analytics/productPerformance'
export function ProductComparison({ change,formatValue=(value:number)=>value.toLocaleString('en-IN') }: { change: PerformanceChange;formatValue?:(value:number)=>string }) {
  const text = change.status === 'AVAILABLE' ? `${change.change! > 0 ? '+' : ''}${change.change}${change.kind === 'points' ? ' pp' : '%'} vs previous period`
    : change.status === 'ZERO_BASELINE' ? 'Previous period was zero'
    : change.status === 'MISSING_COST' ? 'Cost coverage needed'
    : change.status === 'NO_BASELINE' ? 'No previous product activity'
    : 'Comparison history incomplete or unverified'
  return <small className="product-comparison">{change.previous!==null?<>Previously {formatValue(change.previous)} · </>:null}{text}</small>
}
