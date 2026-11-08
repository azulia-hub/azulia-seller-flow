import type { CanonicalFinancialEvent } from '../data/types'
import { canonicalDateKey } from '../analytics/dashboardSummary'

export interface WeeklyPayoutForecast {
  readonly weekNumber: number
  readonly estimatedDate: string
  readonly projectedAmount: number
}

export interface SettlementForecast {
  readonly currentUnsettledBalance: number
  readonly estimatedReserveAmount: number
  readonly nextEstimatedPayoutDate: string
  readonly nextEstimatedPayoutAmount: number
  readonly rollingWeeklyForecast: readonly WeeklyPayoutForecast[]
  readonly cadenceDays: number
}

export function forecastCashSettlements(
  events: readonly CanonicalFinancialEvent[],
  anchorDate = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10),
): SettlementForecast {
  const anchorTime = Date.parse(`${anchorDate}T00:00:00Z`)

  // Find last settlement event
  let lastSettlementDate: string | null = null
  for (const event of events) {
    if (event.amountClass === 'SETTLEMENT' || event.event === 'SETTLEMENT') {
      const d = canonicalDateKey(event.date)
      if (d && (!lastSettlementDate || d > lastSettlementDate)) {
        lastSettlementDate = d
      }
    }
  }

  // Operating events since last settlement
  let unsettledNet = 0
  let recent7dSales = 0
  const reserveThresholdDate = new Date(anchorTime - 7 * 86400000).toISOString().slice(0, 10)

  for (const event of events) {
    if (event.amountClass !== 'OPERATING') continue
    const dateKey = canonicalDateKey(event.date)
    if (!dateKey) continue

    if (!lastSettlementDate || dateKey > lastSettlementDate) {
      unsettledNet += event.amount
    }

    if (dateKey >= reserveThresholdDate && dateKey <= anchorDate && event.event === 'SALE' && event.amountType === 'PRODUCT_REVENUE') {
      recent7dSales += event.amount
    }
  }

  // Amazon reserves roughly 30-50% of recent 7-day sales for return claims
  const estimatedReserveAmount = Math.round(Math.max(0, recent7dSales * 0.35) * 100) / 100
  const currentUnsettledBalance = Math.round(unsettledNet * 100) / 100
  const nextEstimatedPayoutAmount = Math.max(0, Math.round((currentUnsettledBalance - estimatedReserveAmount) * 100) / 100)

  // Standard 7-day cadence
  const cadenceDays = 7
  const nextPayoutTime = anchorTime + 4 * 86400000 // Next upcoming regular payout in ~4 days
  const nextEstimatedPayoutDate = new Date(nextPayoutTime).toISOString().slice(0, 10)

  // Estimate rolling 4 weeks
  const weeklyRunRate = Math.max(nextEstimatedPayoutAmount, Math.round(recent7dSales * 0.6))
  const rollingWeeklyForecast: WeeklyPayoutForecast[] = [
    {
      weekNumber: 1,
      estimatedDate: nextEstimatedPayoutDate,
      projectedAmount: nextEstimatedPayoutAmount,
    },
    {
      weekNumber: 2,
      estimatedDate: new Date(nextPayoutTime + 7 * 86400000).toISOString().slice(0, 10),
      projectedAmount: weeklyRunRate,
    },
    {
      weekNumber: 3,
      estimatedDate: new Date(nextPayoutTime + 14 * 86400000).toISOString().slice(0, 10),
      projectedAmount: weeklyRunRate,
    },
    {
      weekNumber: 4,
      estimatedDate: new Date(nextPayoutTime + 21 * 86400000).toISOString().slice(0, 10),
      projectedAmount: weeklyRunRate,
    },
  ]

  return {
    currentUnsettledBalance,
    estimatedReserveAmount,
    nextEstimatedPayoutDate,
    nextEstimatedPayoutAmount,
    rollingWeeklyForecast,
    cadenceDays,
  }
}
