type Props = {
  label: string
  value: string
  delta?: string
  tone?: 'positive' | 'negative' | 'neutral' | 'accent'
  unavailableReason?: string
  note?: string
  hint?: string
  onClick?: () => void
}

export function KpiCard({ label, value, delta, tone = 'neutral', hint, onClick, unavailableReason, note }: Props) {
  return (
    <article className={`kpi-card ${tone} ${onClick ? 'clickable' : ''}`} onClick={onClick} onKeyDown={(event) => { if (onClick && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onClick() } }} aria-description={hint} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
      <div className="kpi-topline">
        <span title={hint}>{label}</span>{onClick ? <span className="kpi-chevron" aria-hidden="true">↗</span> : null}
      </div>
      <strong>{value}</strong>
      {note ? <small className="metric-note">{note}</small> : null}
      {unavailableReason ? <small className="metric-unavailable-reason">{unavailableReason}</small> : null}
      {delta ? <div className="kpi-footer"><span className={`delta ${tone}`}>{delta}</span></div> : null}
      {onClick ? <span className="drilldown-cue">Explore →</span> : null}
    </article>
  )
}
