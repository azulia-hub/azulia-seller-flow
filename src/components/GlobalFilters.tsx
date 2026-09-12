import type { TimePeriodPreset } from '../core/analytics/timePeriods'
type PeriodChoice = TimePeriodPreset | 'CUSTOM'

type Props = {
  readonly source: string
  readonly fulfillmentTypes: readonly string[]
  readonly fulfillmentType: string
  readonly fromDate: string
  readonly toDate: string
  readonly minDate?: string
  readonly maxDate?: string
  readonly period: PeriodChoice | ''
  readonly periods: readonly { id: TimePeriodPreset; label: string }[]
  readonly onFulfillmentTypeChange: (value: string) => void
  readonly onFromDateChange: (value: string) => void
  readonly onToDateChange: (value: string) => void
  readonly onPeriodChange: (value: PeriodChoice) => void
  readonly onClear: () => void
}

export function GlobalFilters(props: Props) {
  const activeCount = [props.fulfillmentType, props.period].filter(Boolean).length
  return <details className="global-filter-card" open>
    <summary><span><b>Filter this report</b><small>{activeCount ? `${activeCount} filters applied` : `All ${props.source} transactions`}</small></span><span className="filter-summary-action">Adjust filters</span></summary>
    <div className="global-filter-fields">
      <label>Fulfilment type<select value={props.fulfillmentType} onChange={(event) => props.onFulfillmentTypeChange(event.target.value)}><option value="">All fulfilment types</option>{props.fulfillmentTypes.map(type => <option key={type}>{type}</option>)}</select></label>
      <label>Time period<select value={props.period} onChange={(event) => props.onPeriodChange(event.target.value as PeriodChoice)}>{props.periods.map(period => <option key={period.id} value={period.id}>{period.label}</option>)}<option value="CUSTOM">Custom range</option></select></label>
      {props.period === 'CUSTOM' ? <><label>From date<input type="date" min={props.minDate} max={props.toDate || props.maxDate} value={props.fromDate} onChange={(event) => props.onFromDateChange(event.target.value)} /></label><label>To date<input type="date" min={props.fromDate || props.minDate} max={props.maxDate} value={props.toDate} onChange={(event) => props.onToDateChange(event.target.value)} /></label></> : null}
      {activeCount ? <button className="secondary" onClick={props.onClear}>Clear all</button> : null}
    </div>
  </details>
}
