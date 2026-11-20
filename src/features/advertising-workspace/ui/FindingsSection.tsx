import type { AdvertisingEntity, AdvertisingFinding } from '../contract'

interface FindingsSectionProps {
  readonly findings: readonly AdvertisingFinding[]
  readonly onOpenEntity: (entity: AdvertisingEntity) => void
}

export function FindingsSection({ findings, onOpenEntity }: FindingsSectionProps) {
  if (!findings || findings.length === 0) return null

  // Show at most 3 findings initially
  const displayFindings = findings.slice(0, 3)

  return (
    <section className="adsw-findings-card" aria-label="Advertising review findings">
      <div className="adsw-findings-header">
        <h3>Needs review ({findings.length})</h3>
      </div>
      <div className="adsw-findings-list">
        {displayFindings.map(finding => {
          const isReview = finding.severity === 'REVIEW'
          return (
            <div key={finding.id} className="adsw-finding-item" data-testid={`finding-${finding.id}`}>
              <div className="adsw-finding-top">
                <h4 className="adsw-finding-title">{finding.title}</h4>
                <span
                  className={`adsw-finding-badge ${isReview ? 'is-review' : 'is-data-quality'}`}
                >
                  {isReview ? 'Review signal' : 'Data quality'}
                </span>
              </div>
              <p className="adsw-finding-exp">{finding.explanation}</p>
              {finding.evidence && finding.evidence.length > 0 ? (
                <ul className="adsw-finding-evidence">
                  {finding.evidence.map((ev, i) => (
                    <li key={i}>{ev}</li>
                  ))}
                </ul>
              ) : null}
              <div style={{ marginTop: 6 }}>
                <button
                  type="button"
                  className="adsw-btn adsw-btn-ghost"
                  onClick={() => onOpenEntity(finding.entity)}
                >
                  View evidence →
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
