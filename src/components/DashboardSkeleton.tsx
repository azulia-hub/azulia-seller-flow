/** Presentation only: financial calculations remain in the analytics engine. */
export function DashboardSkeleton() {
  return <section className="dashboard-skeleton" aria-busy="true" aria-label="Calculating dashboard">
    <span className="dashboard-loading-label" role="status">Updating your dashboard…</span>
    <div className="kpi-grid primary-kpis" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => <div className="kpi-card skeleton-card" key={index}>
        <span className="skeleton-line skeleton-label" />
        <span className="skeleton-line skeleton-value" />
        <span className="skeleton-line skeleton-note" />
      </div>)}
    </div>
    <div className="workspace-overview-grid" aria-hidden="true">
      <div className="skeleton-card skeleton-chart"><span className="skeleton-line skeleton-label" /><span className="skeleton-line skeleton-plot" /></div>
      <div className="skeleton-card skeleton-chart"><span className="skeleton-line skeleton-label" />{Array.from({ length: 5 }, (_, index) => <span className="skeleton-line skeleton-row" key={index} />)}</div>
    </div>
  </section>
}
