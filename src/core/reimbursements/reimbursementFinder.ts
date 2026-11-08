import type { CanonicalFinancialEvent } from '../data/types'
import { canonicalDateKey } from '../analytics/dashboardSummary'

export interface ReimbursementClaim {
  readonly orderId: string
  readonly sku: string
  readonly refundDate: string
  readonly amount: number
  readonly daysElapsed: number
  readonly claimText: string
}

export interface ReimbursementSummary {
  readonly claims: readonly ReimbursementClaim[]
  readonly totalEligibleAmount: number
  readonly totalClaimsCount: number
}

export function findReimbursementClaims(
  events: readonly CanonicalFinancialEvent[],
  anchorDate = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10),
  claimThresholdDays = 45,
): ReimbursementSummary {
  const anchorTime = Date.parse(`${anchorDate}T00:00:00Z`)
  const refunds = new Map<string, { event: CanonicalFinancialEvent; date: string; amount: number }>()
  const reimbursedOrders = new Set<string>()

  // Track reimbursements
  for (const event of events) {
    if (event.event === 'REIMBURSEMENT' && event.orderId) {
      reimbursedOrders.add(event.orderId)
    }
  }

  // Find unreturned refunds
  for (const event of events) {
    if (event.event === 'REFUND' && event.orderId && event.amount < 0 && event.amountType === 'PRODUCT_REVENUE') {
      const dateKey = canonicalDateKey(event.date)
      if (!dateKey) continue
      const existing = refunds.get(event.orderId)
      if (!existing || existing.amount > event.amount) {
        refunds.set(event.orderId, { event, date: dateKey, amount: Math.abs(event.amount) })
      }
    }
  }

  const claims: ReimbursementClaim[] = []
  let totalEligibleAmount = 0

  for (const [orderId, { event, date, amount }] of refunds.entries()) {
    if (reimbursedOrders.has(orderId)) continue

    const refundTime = Date.parse(`${date}T00:00:00Z`)
    const daysElapsed = Math.floor((anchorTime - refundTime) / 86400000)

    if (daysElapsed >= claimThresholdDays) {
      const sku = event.sku || 'Unknown SKU'
      const claimText = [
        `Dear Amazon Seller Support,`,
        ``,
        `Please investigate the following customer refund that occurred over 45 days ago, for which the merchandise has not been returned to our inventory and no automatic reimbursement was credited:`,
        ``,
        `• Amazon Order ID: ${orderId}`,
        `• Product SKU: ${sku}`,
        `• Customer Refund Date: ${date} (${daysElapsed} days ago)`,
        `• Debited Refund Amount: ₹${amount.toLocaleString('en-IN')}`,
        ``,
        `Per Amazon's customer return policy, sellers are entitled to reimbursement when returned items are not physically received back into sellable or unsellable inventory within 45 days.`,
        ``,
        `Kindly verify our inventory logs and process the appropriate reimbursement for this order.`,
        ``,
        `Thank you.`,
      ].join('\n')

      claims.push({
        orderId,
        sku,
        refundDate: date,
        amount,
        daysElapsed,
        claimText,
      })

      totalEligibleAmount += amount
    }
  }

  // Sort by highest unrecovered amount first
  claims.sort((a, b) => b.amount - a.amount || b.daysElapsed - a.daysElapsed)

  return {
    claims,
    totalEligibleAmount: Math.round(totalEligibleAmount * 100) / 100,
    totalClaimsCount: claims.length,
  }
}
