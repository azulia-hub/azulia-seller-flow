import { useId } from 'react'

/** Small, visible choices use native radios for keyboard and screen-reader support. */
export function ChoiceGroup<T extends string>({ label, value, options, onChange, className = '' }: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
}) {
  const name = useId()
  return <fieldset className={`choice-group ${className}`}><legend>{label}</legend><div>{options.map(option => <label key={option.value} className={value === option.value ? 'is-selected' : ''}><input type="radio" name={name} checked={value === option.value} onChange={() => onChange(option.value)} /><span>{option.label}</span></label>)}</div></fieldset>
}
