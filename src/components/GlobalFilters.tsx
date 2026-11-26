import { SavedFilters, type FilterView } from './SavedFilters'
import { advertisingDateRange } from './AdvertisingRecovery'
import type { TimePeriodPreset } from '../core/analytics/timePeriods'
type PeriodChoice = TimePeriodPreset | 'ALL' | 'CUSTOM'

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
  readonly onApplySaved: (view: FilterView) => void
  readonly onClear: () => void
}

export function GlobalFilters(props: Props) {
  const activeCount = [props.fulfillmentType, props.period && props.period !== 'ALL' ? props.period : ''].filter(Boolean).length
  return <details className="global-filter-card">
    <summary><span><b>{props.fromDate && props.toDate ? advertisingDateRange(props.fromDate, props.toDate) : 'Entire report'}</b><small>Orders by purchase date{props.fulfillmentType ? ` · ${props.fulfillmentType}` : ''}</small></span><span className="filter-summary-action">Filters</span></summary>
    <div className="global-filter-fields">
      <label>Fulfilment type<select value={props.fulfillmentType} onChange={(event) => props.onFulfillmentTypeChange(event.target.value)}><option value="">All fulfilment types</option>{props.fulfillmentTypes.map(type => <option key={type} value={type}>{type === 'AFN' ? 'FBA (AFN)' : type === 'MFN' ? 'FBM (MFN / Easy Ship)' : type}</option>)}</select></label>
      <label>Time period<select value={props.period} onChange={(event) => props.onPeriodChange(event.target.value as PeriodChoice)}><option value="ALL">Entire report</option>{props.periods.map(period => <option key={period.id} value={period.id}>{period.label}</option>)}<option value="CUSTOM">Custom range</option></select></label>
      {activeCount ? <button className="secondary" onClick={props.onClear}>Clear all</button> : null}
      {props.period === 'CUSTOM' ? <div className="filter-custom-dates"><label>From date<input type="date" min={props.minDate} max={props.toDate || props.maxDate} value={props.fromDate} onChange={(event) => props.onFromDateChange(event.target.value)} /></label><label>To date<input type="date" min={props.fromDate || props.minDate} max={props.maxDate} value={props.toDate} onChange={(event) => props.onToDateChange(event.target.value)} /></label></div> : null}
    </div>
    {props.period ? <SavedFilters
      view={{ period: props.period, fulfillment: props.fulfillmentType, from: props.fromDate, to: props.toDate }}
      available={view => (!view.fulfillment || props.fulfillmentTypes.includes(view.fulfillment)) &&
        (view.period === 'ALL' || view.period === 'CUSTOM' || props.periods.some(period => period.id === view.period)) &&
        (view.period !== 'CUSTOM' || Boolean(view.from && view.to && view.from <= view.to &&
          (!props.minDate || view.from >= props.minDate) && (!props.maxDate || view.to <= props.maxDate)))}
      onApply={props.onApplySaved} /> : null}
    <p className="filter-basis-help">Includes recorded sales, charges, refunds and reimbursements for orders purchased in these dates, without waiting for release. Later updates stay in the original purchase period. Account charges use posting dates.</p>
  </details>
}
