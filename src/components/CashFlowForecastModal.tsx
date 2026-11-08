import type { SettlementForecast } from '../core/cashflow/payoutForecast'

interface Props {
  readonly forecast: SettlementForecast
  readonly onClose: () => void
}

export function CashFlowForecastModal({ forecast, onClose }: Props) {
  return (
    <div className="audit-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="cashflow-title">
      <div className="audit-modal" style={{ maxWidth: 760 }}>
        <div className="audit-modal-head">
          <div>
            <h2 id="cashflow-title">Cash Flow & Settlement Payout Forecast</h2>
            <p style={{ margin: '4px 0', fontSize: 13, color: 'var(--muted)' }}>
              Projected Amazon bank disbursements based on recent sales and 7-day reserve policy.
            </p>
          </div>
          <button className="text-btn" onClick={onClose} aria-label="Close dialog">✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: '16px 0' }}>
          <div className="panel" style={{ padding: '12px 14px', background: 'rgba(74, 222, 128, 0.08)', border: '1px solid var(--good, #4ade80)' }}>
            <small style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Next Est. Payout</small>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--good, #4ade80)', margin: '4px 0' }}>
              ₹{forecast.nextEstimatedPayoutAmount.toLocaleString('en-IN')}
            </div>
            <small style={{ fontSize: 11, color: 'var(--muted)' }}>Expected: {forecast.nextEstimatedPayoutDate}</small>
          </div>

          <div className="panel" style={{ padding: '12px 14px' }}>
            <small style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Unsettled Balance</small>
            <div style={{ fontSize: 20, fontWeight: 700, margin: '4px 0' }}>
              ₹{forecast.currentUnsettledBalance.toLocaleString('en-IN')}
            </div>
            <small style={{ fontSize: 11, color: 'var(--muted)' }}>Cleared net sales & fees</small>
          </div>

          <div className="panel" style={{ padding: '12px 14px' }}>
            <small style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Return Reserve Hold</small>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b', margin: '4px 0' }}>
              ₹{forecast.estimatedReserveAmount.toLocaleString('en-IN')}
            </div>
            <small style={{ fontSize: 11, color: 'var(--muted)' }}>7-day delivery reserve</small>
          </div>
        </div>

        <h3 style={{ fontSize: 13, marginTop: 18, marginBottom: 8 }}>Rolling 4-Week Cash Calendar</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="audit-table" style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr>
                <th>Disbursement Period</th>
                <th>Estimated Payout Date</th>
                <th>Projected Net Deposit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {forecast.rollingWeeklyForecast.map((week, idx) => (
                <tr key={week.weekNumber}>
                  <td style={{ fontWeight: 600 }}>Week {week.weekNumber} Payout</td>
                  <td>{week.estimatedDate}</td>
                  <td style={{ fontWeight: 700, color: 'var(--good, #4ade80)' }}>
                    ₹{week.projectedAmount.toLocaleString('en-IN')}
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: idx === 0 ? 'rgba(74, 222, 128, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                        color: idx === 0 ? 'var(--good, #4ade80)' : 'var(--muted)',
                      }}
                    >
                      {idx === 0 ? 'Upcoming Settlement' : 'Projected Run-rate'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="audit-modal-foot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          <small style={{ color: 'var(--muted)' }}>
            Amazon transfers funds to your bank account every 7 days. Payouts do not alter operating profit.
          </small>
          <button className="primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
