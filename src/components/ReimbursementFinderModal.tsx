import { useState } from 'react'
import type { ReimbursementSummary } from '../core/reimbursements/reimbursementFinder'

interface Props {
  readonly summary: ReimbursementSummary
  readonly onClose: () => void
}

export function ReimbursementFinderModal({ summary, onClose }: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  function copyClaim(orderId: string, claimText: string) {
    void navigator.clipboard.writeText(claimText)
    setCopiedId(orderId)
    setTimeout(() => setCopiedId(null), 2500)
  }

  return (
    <div className="audit-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="reimb-title">
      <div className="audit-modal reimbursement-finder-modal" style={{ maxWidth: 840 }}>
        <div className="audit-modal-head">
          <div>
            <h2 id="reimb-title">Amazon Reimbursement & Lost Refund Finder</h2>
            <p style={{ margin: '4px 0', fontSize: 13, color: 'var(--muted)' }}>
              Amazon policy reimburses sellers when refunded customer items are not returned to inventory after 45 days.
            </p>
          </div>
          <button className="text-btn" onClick={onClose} aria-label="Close dialog">✕</button>
        </div>

        <div className="reimb-summary-banner" style={{ display: 'flex', gap: 16, alignItems: 'center', background: 'rgba(74, 222, 128, 0.1)', border: '1px solid var(--good, #4ade80)', borderRadius: 8, padding: '12px 16px', margin: '14px 0' }}>
          <div>
            <small style={{ textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em', color: 'var(--muted)' }}>Potential Claim Value</small>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--good, #4ade80)' }}>
              ₹{summary.totalEligibleAmount.toLocaleString('en-IN')}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{summary.totalClaimsCount} eligible refunds</span>
            <small style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>Over 45 days without inventory return</small>
          </div>
        </div>

        {!summary.claims.length ? (
          <div style={{ textAlign: 'center', padding: '30px 16px', color: 'var(--muted)' }}>
            ✓ No unrecovered refunds found. All customer refunds in this report have been returned or reimbursed.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: '55vh' }}>
            <table className="audit-table" style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>SKU</th>
                  <th>Refund Date</th>
                  <th>Elapsed</th>
                  <th>Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {summary.claims.map(claim => (
                  <tr key={claim.orderId}>
                    <td style={{ fontFamily: 'monospace' }}>{claim.orderId}</td>
                    <td>{claim.sku}</td>
                    <td>{claim.refundDate}</td>
                    <td>{claim.daysElapsed} days</td>
                    <td style={{ fontWeight: 600 }}>₹{claim.amount.toLocaleString('en-IN')}</td>
                    <td>
                      <button
                        className="secondary"
                        style={{ minHeight: 30, padding: '4px 10px', fontSize: 11 }}
                        onClick={() => copyClaim(claim.orderId, claim.claimText)}
                      >
                        {copiedId === claim.orderId ? 'Copied ✓' : 'Copy Claim Text'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="audit-modal-foot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          <small style={{ color: 'var(--muted)' }}>
            Paste the copied claim text into Amazon Seller Support → Help → Manage FBA Issues / Contact Us.
          </small>
          <button className="primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
