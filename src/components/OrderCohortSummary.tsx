import type { CohortFinancials, OrderCohort } from '../core/analytics/orderLifecycle'

type Props = { cohort: OrderCohort; financials: CohortFinancials; salePeriodView: boolean; postedCount: number; formatMoney: (value: number) => string; onReview: () => void }

export function OrderCohortSummary({ cohort, financials, salePeriodView, postedCount, formatMoney, onReview }: Props) {
  return <>
    <section className={`cohort-summary ${salePeriodView ? 'active' : ''}`} aria-label="Order analysis scope">
      <div><small>{salePeriodView ? 'Orders sold in selected period' : 'Posted activity'}</small>
        <strong>{salePeriodView ? `${cohort.orders.length.toLocaleString('en-IN')} sale-period orders selected` : `${postedCount.toLocaleString('en-IN')} posted transactions included`}</strong>
        <p>{salePeriodView ? `Original sales: ${cohort.range.from} → ${cohort.range.to} · linked activity observed through ${cohort.observationThrough ?? 'unknown'}. Released results exclude pending transactions. Later adjustments may change these results.` : 'Every source event posted within the selected dates is included, including deferred activity, for reconciliation.'}</p>
        {salePeriodView ? <p>Account-level expenses without an order ID use their posting dates in the selected period. Settlement transfers stay outside operating profit.</p> : null}
        {salePeriodView && cohort.limitedFollowUpOrderCount > 0 ? <p>{cohort.limitedFollowUpOrderCount} orders have less than 20 days of follow-up. Their known activity is included.</p> : null}
        {salePeriodView && cohort.unspecifiedStatusEventCount > 0 ? <p>{cohort.unspecifiedStatusEventCount} events have missing or other release statuses; they remain included and visible in source evidence.</p> : null}
      </div>
      <div className="cohort-summary-actions"><span>{cohort.pendingOrderCount} orders with pending activity · {cohort.missingSale.length} original sales missing</span><button className="secondary" onClick={onReview}>Review pending &amp; unmatched activity</button></div>
    </section>
    {salePeriodView && cohort.pendingEvents.length > 0 ? <section className="panel pending-activity-panel" aria-label="Pending activity">
      <div className="panel-head"><div><small>Separate from released results</small><h3>Pending activity</h3><p>Deferred amounts are excluded from the main cards. The estimate below includes pending activity once.</p></div><button className="secondary" onClick={onReview}>Review transactions</button></div>
      <div className="pending-activity-grid">{[
        ['Pending sales', financials.pending.grossSales], ['Pending refunds', financials.pending.refundValue],
        ['Pending fees', financials.pending.charges], ['Pending reimbursements', financials.pending.reimbursements],
        ['Pending operating net', financials.pending.operatingNet], ['Pending settlement transfers', financials.pending.settlementNet],
      ].map(([label, value]) => <article key={label}><span>{label}</span><strong>{formatMoney(value as number)}</strong></article>)}</div>
      <details className="pending-estimate"><summary>Estimated result including pending activity</summary><div className="pending-activity-grid"><article><span>Estimated sales</span><strong>{formatMoney(financials.estimated.grossSales)}</strong></article><article><span>Estimated profit after ads</span><strong>{financials.estimated.profit === null ? 'Unavailable: missing costs' : formatMoney(financials.estimated.profit)}</strong></article></div><p>{financials.estimated.costComplete ? 'Includes product costs and return COGS reversals.' : 'Product costs are incomplete. The estimate follows your configured missing-cost policy.'} Pending amounts may change before release.</p></details>
    </section> : null}
  </>
}
