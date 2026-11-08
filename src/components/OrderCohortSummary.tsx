import { useMemo } from 'react'
import { cohortExcludedRecords, summarizeCohortOrders, type OrderCohort } from '../core/analytics/orderLifecycle'
type Props = { cohort: OrderCohort; salePeriodView: boolean; postedCount: number; syncing?: boolean; onReview: () => void }
export function OrderCohortSummary({ cohort, salePeriodView, postedCount, syncing, onReview }: Props) {
  const excluded = useMemo(() => cohortExcludedRecords(cohort), [cohort])
  const orders = useMemo(() => summarizeCohortOrders(cohort), [cohort])
  return <section className="compact-cohort-scope" aria-label="Calculation coverage">
    <span><strong>{(salePeriodView ? cohort.orders.length : postedCount).toLocaleString('en-IN')}</strong> {salePeriodView ? 'orders in this purchase period' : 'financial records posted in this period'}{salePeriodView && orders.awaitingFinancialCount ? <small> · {orders.awaitingFinancialCount} awaiting financial details</small> : null}{syncing ? <small style={{ color: 'var(--accent, #d4a373)' }}> · Syncing with Amazon…</small> : <small style={{ color: 'var(--good, #4ade80)' }}> · ✓ Up to date</small>}</span>
    {salePeriodView ? <button className="scope-review-button" onClick={onReview}>{excluded.length.toLocaleString('en-IN')} financial records excluded <span aria-hidden="true">↗</span></button> : <small>Includes pending activity · transfers excluded from profit</small>}
  </section>
}
