import { useMemo, useState } from 'react'
import { LazyDetails } from './LazyDetails'
import { calculateProfitScenario, profitScenarioBaseline, type ScenarioBaseline } from '../core/analytics/profitScenario'
import type { SkuProfitSummary } from '../core/analytics/orderProfit'

function baselineInputs(baseline: ScenarioBaseline) {
  return {
    price: String(baseline.price), unitCost: String(baseline.unitCost),
    returns: String(baseline.returnRate * 100), ads: String(baseline.adSpend ?? 0), units: String(baseline.units),
  }
}

function Scenario({ baseline, money }: { baseline: ScenarioBaseline; money: (value: number) => string }) {
  const actual = baselineInputs(baseline)
  const [edits, setEdits] = useState<Partial<typeof actual>>({})
  const values = { ...actual, ...edits }
  const result = Object.values(values).every(value => value.trim()) && calculateProfitScenario(baseline, {
    price: Number(values.price), unitCost: Number(values.unitCost), returnRate: Number(values.returns) / 100,
    adSpend: Number(values.ads), units: Number(values.units),
  })
  return <>
    <p>Baseline contribution {money(baseline.contribution)} across {baseline.units} {baseline.units === 1 ? 'unit' : 'units'}.</p>
    {baseline.adSpend === null ? <p>Baseline excludes advertising because matched spend is unavailable. You can enter expected spend.</p> : null}
    <div className="seller-feature-fields">
      {([['price', 'Selling price per unit'], ['unitCost', 'Product cost per unit'], ['returns', 'Return rate (%)'],
        ['ads', 'Total ad spend'], ['units', 'Units sold']] as const).map(([key, label]) =>
        <label key={key}>{label}<input type="number" min="0" max={key === 'returns' ? 100 : undefined} step={key === 'units' ? 1 : 'any'}
          value={values[key]} onChange={event => setEdits({ ...edits, [key]: event.target.value })} /></label>)}
      <button type="button" className="secondary" onClick={() => setEdits({})}>Reset to baseline</button>
    </div>
    <div aria-live="polite">{result ? <dl className="seller-feature-fields">
      <div><dt>Estimated contribution</dt><dd>{money(result.contribution)}</dd></div>
      <div><dt>Contribution per unit sold</dt><dd>{money(result.perUnit)}</dd></div>
      <div><dt>Break-even price</dt><dd>{result.breakEvenPrice === null ? 'Unavailable' : money(result.breakEvenPrice)}</dd></div>
      <div><dt>Units to match baseline contribution</dt><dd>{result.unitsToMatch ?? 'Unavailable'}</dd></div>
    </dl> : <p>Enter nonnegative values, a return rate from 0–100%, and a positive whole unit count.</p>}</div>
    <p>Estimates use historical refund and cost recovery per return. Other fees and adjustments stay fixed per unit, and total ad spend stays fixed as volume changes.</p>
  </>
}

function SimulatorContents({ product, adSpend, basis, money }: {
  product: SkuProfitSummary; adSpend: number | null; basis: string; money: (value: number) => string
}) {
  const baseline = useMemo(() => profitScenarioBaseline(product, adSpend), [product, adSpend])
  return <>
    <p>Baseline period · {basis}</p>
    {baseline ? <Scenario key={basis} baseline={baseline} money={money} /> :
      <p>{product.missingCost ? 'Add costs for the applicable periods to simulate profit.' : 'This period has insufficient sales, cost, or return data for a baseline.'}</p>}
  </>
}

export function ProfitSimulator(props: Parameters<typeof SimulatorContents>[0]) {
  return <LazyDetails className="panel seller-feature-panel" summary="Simulate profit">
    <SimulatorContents {...props} />
  </LazyDetails>
}
