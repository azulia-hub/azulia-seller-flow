import { ChoiceGroup } from './ChoiceGroup'
import { advertisingDateRange } from './AdvertisingRecovery'
import type { TimePeriodPreset } from '../core/analytics/timePeriods'
type PeriodChoice = TimePeriodPreset | 'ALL' | 'CUSTOM'
export type CalculationBasis = 'COMPLETED_ORDERS' | 'POSTED_ACTIVITY'

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
  readonly calculationBasis: CalculationBasis
  readonly onFulfillmentTypeChange: (value: string) => void
  readonly onFromDateChange: (value: string) => void
  readonly onToDateChange: (value: string) => void
  readonly onPeriodChange: (value: PeriodChoice) => void
  readonly onCalculationBasisChange: (value: CalculationBasis) => void
  readonly onClear: () => void
}

export function GlobalFilters(props: Props) {
  const activeCount = [props.fulfillmentType, props.period && props.period !== 'ALL' ? props.period : '', props.calculationBasis !== 'COMPLETED_ORDERS' ? props.calculationBasis : ''].filter(Boolean).length
  return <details className="global-filter-card">
    <summary><span><b>{props.fromDate && props.toDate ? advertisingDateRange(props.fromDate, props.toDate) : 'Entire report'}</b><small>{props.calculationBasis === 'COMPLETED_ORDERS' ? 'Sales-period view' : 'Transactions by posting date'}{props.fulfillmentType ? ` · ${props.fulfillmentType}` : ''}</small></span><span className="filter-summary-action">Filters</span></summary>
    <p className="filter-basis-help">Sales-period view groups sales with later linked refunds and excludes orders without sufficient follow-up history. Transactions by posting date includes every transaction posted in the selected dates.</p>
    <div className="global-filter-fields">
      <label>Fulfilment type<select value={props.fulfillmentType} onChange={(event) => props.onFulfillmentTypeChange(event.target.value)}><option value="">All fulfilment types</option>{props.fulfillmentTypes.map(type => <option key={type}>{type}</option>)}</select></label>
      <label>Time period<select value={props.period} onChange={(event) => props.onPeriodChange(event.target.value as PeriodChoice)}><option value="ALL">Entire report</option>{props.periods.map(period => <option key={period.id} value={period.id}>{period.label}</option>)}<option value="CUSTOM">Custom range</option></select></label>
      <ChoiceGroup label="Calculation view" value={props.calculationBasis} onChange={props.onCalculationBasisChange} options={[{ value: 'COMPLETED_ORDERS', label: 'Sales-period view' }, { value: 'POSTED_ACTIVITY', label: 'Transactions by posting date' }]} />
      {props.period === 'CUSTOM' ? <><label>From date<input type="date" min={props.minDate} max={props.toDate || props.maxDate} value={props.fromDate} onChange={(event) => props.onFromDateChange(event.target.value)} /></label><label>To date<input type="date" min={props.fromDate || props.minDate} max={props.maxDate} value={props.toDate} onChange={(event) => props.onToDateChange(event.target.value)} /></label></> : null}
      {activeCount ? <button className="secondary" onClick={props.onClear}>Clear all</button> : null}
    </div>
  </details>
}
