type Props = {
  label: string
  value: string
  delta?: string
  tone?: 'positive' | 'negative' | 'neutral' | 'accent'
  hint?: string
  onClick?: () => void
}

export function KpiCard({ label, value, delta, tone = 'neutral', hint, onClick }: Props) {
  return (
    <article className={`kpi-card ${tone} ${onClick ? 'clickable' : ''}`} onClick={onClick} onKeyDown={(event) => { if (onClick && (event.key === 'Enter' || event.key === ' ')) onClick() }} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
      <div className="kpi-topline">
        <span>{label}</span><i className="kpi-color-dot" aria-hidden="true" />
      </div>
      <strong>{value}</strong>
      <div className="kpi-footer">
        {delta ? <span className={`delta ${tone}`}>{delta}</span> : <span />}
        {hint ? <small>{hint}</small> : null}
      </div>
      {onClick ? <span className="drilldown-cue">View orders →</span> : null}
    </article>
  )
}
