import { useState } from 'react'
import { TIME_PERIOD_OPTIONS, type TimePeriodPreset } from '../core/analytics/timePeriods'

export type FilterView = {
  period: TimePeriodPreset | 'ALL' | 'CUSTOM'
  fulfillment: string
  from: string
  to: string
}
type SavedView = FilterView & { name: string }

const storageKey = 'azulia:saved-filters:v1'
function loadViews(): SavedView[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    if (!Array.isArray(stored)) return []
    return stored.filter((view): view is SavedView => view && typeof view.name === 'string' &&
      typeof view.fulfillment === 'string' && typeof view.from === 'string' && typeof view.to === 'string' &&
      (['ALL', 'CUSTOM'].includes(view.period) || TIME_PERIOD_OPTIONS.some(option => option.id === view.period)))
  } catch {
    return []
  }
}

export function SavedFilters({ view, available, onApply }: {
  view: FilterView; available: (view: FilterView) => boolean; onApply: (view: FilterView) => void
}) {
  const [views, setViews] = useState(loadViews)
  const [name, setName] = useState('')
  const [selected, setSelected] = useState('')
  const [message, setMessage] = useState('')
  const target = views.find(item => item.name === selected)
  const exists = views.some(item => item.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())
  function persist(next: SavedView[], nextSelected: string) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
      setViews(next)
      setSelected(nextSelected)
      setName('')
      setMessage(nextSelected ? 'Filter saved on this device.' : 'Saved filter removed.')
    } catch {
      setMessage('Saved filters could not be updated on this device.')
    }
  }

  return <div className="seller-feature-fields">
    <label>Saved filters<select value={selected} onChange={event => { setSelected(event.target.value); setMessage('') }}>
      <option value="">Choose a saved filter</option>
      {views.map(item => <option key={item.name}>{item.name}</option>)}
    </select></label>
    <button type="button" className="secondary" disabled={!target || !available(target)} onClick={() => { if (target) onApply(target) }}>Apply</button>
    <button type="button" className="text-btn" disabled={!target} onClick={() => persist(views.filter(item => item !== target), '')}>Remove saved filter</button>
    <form className="seller-feature-fields" onSubmit={event => {
      event.preventDefault()
      if (name.trim() && !exists && available(view)) persist([...views, { ...view, name: name.trim() }], name.trim())
    }}>
      <label>Save current filters as<input value={name} maxLength={60} onChange={event => { setName(event.target.value); setMessage('') }} /></label>
      <button className="secondary" disabled={!name.trim() || exists || !available(view)}>Save filter</button>
    </form>
    <small role="status">{message || (target && !available(target) ? 'This filter is unavailable for the current report.' : exists ? 'That name is already in use.' : '')}</small>
  </div>
}
