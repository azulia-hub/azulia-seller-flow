import { useId, useRef, useState, useSyncExternalStore } from 'react'
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

function FilterFields(props: Props) {
  const activeCount = [props.fulfillmentType, props.period && props.period !== 'ALL' ? props.period : ''].filter(Boolean).length
  return <>
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
  </>
}

const phoneFilterQuery = '(max-width: 700px)'
function subscribeToPhoneWidth(listener: () => void) {
  const query = window.matchMedia(phoneFilterQuery)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

export function GlobalFilters(props: Props) {
  const phone = useSyncExternalStore(subscribeToPhoneWidth, () => window.matchMedia(phoneFilterQuery).matches)
  const [draft, setDraft] = useState<FilterView | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const start = (): FilterView => ({
    period: props.period || 'ALL', fulfillment: props.fulfillmentType, from: props.fromDate, to: props.toDate,
  })
  const label = <>
    <span><b>{props.fromDate && props.toDate ? advertisingDateRange(props.fromDate, props.toDate) : 'Entire report'}</b>
      <small>Orders by purchase date{props.fulfillmentType ? ` · ${props.fulfillmentType}` : ''}</small></span>
    <span className="filter-summary-action">Filters</span>
  </>
  const valid = draft && (draft.period !== 'CUSTOM' || Boolean(draft.from && draft.to && draft.from <= draft.to &&
    (!props.minDate || draft.from >= props.minDate) && (!props.maxDate || draft.to <= props.maxDate)))
  if (!phone) return <details className="global-filter-card desktop-filter-card">
      <summary>{label}</summary>
      <FilterFields {...props} />
    </details>
  return <div className="global-filter-card phone-filter-card">
      <button type="button" className="phone-filter-trigger" aria-haspopup="dialog" onClick={() => {
        setDraft(start())
        dialog.current?.showModal()
      }}>{label}</button>
      <dialog ref={dialog} className="phone-filter-sheet" aria-labelledby={titleId} onClose={() => setDraft(null)}>
        <header><h2 id={titleId}>Filters</h2><button type="button" className="text-btn" onClick={() => dialog.current?.close()}>Cancel</button></header>
        {draft ? <FilterFields {...props} period={draft.period} fulfillmentType={draft.fulfillment}
          fromDate={draft.from} toDate={draft.to}
          onPeriodChange={period => setDraft({ ...draft, period })}
          onFulfillmentTypeChange={fulfillment => setDraft({ ...draft, fulfillment })}
          onFromDateChange={from => setDraft({ ...draft, from })}
          onToDateChange={to => setDraft({ ...draft, to })}
          onApplySaved={setDraft}
          onClear={() => setDraft({ ...start(), period: 'ALL', fulfillment: '' })}
        /> : null}
        <footer><button type="button" className="primary" disabled={!valid} onClick={() => {
          if (draft && valid) props.onApplySaved(draft)
          dialog.current?.close()
        }}>Apply filters</button></footer>
      </dialog>
    </div>
}
