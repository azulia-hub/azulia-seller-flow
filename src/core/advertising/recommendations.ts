import type { AdvertisingMetrics } from './workspace'
export interface AdvertisingRecommendation {
  readonly action: 'LOWER' | 'RAISE' | 'HOLD' | 'CHECK'
  readonly text: string
  readonly reason: string
  readonly suggestedBid: number | null
}
/** Advisory, bounded suggestions against an explicit efficiency target, never automatic writes. */
export function recommendAdvertising(metrics: AdvertisingMetrics, options: { completeCoverage: boolean; targetAcos: number; currentBid?: number | null; status?: string | null }): AdvertisingRecommendation {
  const result = (action: AdvertisingRecommendation['action'], text: string, reason: string, factor?: number): AdvertisingRecommendation => ({ action, text, reason, suggestedBid: factor && options.currentBid && options.currentBid > 0 ? Math.round(options.currentBid * factor * 100) / 100 : null })
  if (!Number.isFinite(options.targetAcos) || options.targetAcos <= 0 || options.targetAcos > 100) throw new Error('Choose a target ACOS between 0 and 100%.')
  if (!options.completeCoverage) return result('HOLD', 'Wait for complete, mature data', 'Suggestions require complete coverage and exclude the latest attribution window.')
  if (options.status && options.status !== 'ENABLED') return result('CHECK', 'Check current delivery state', `Currently ${options.status.toLowerCase()}; historical results do not establish current eligibility.`)
  if (metrics.clicks === null || metrics.purchases === null || metrics.spend === null || metrics.attributedSales === null) return result('HOLD', 'Insufficient performance evidence', 'Required performance fields are unavailable.')
  if (metrics.clicks === 0) return result('CHECK', 'Check delivery and relevance', 'No recorded clicks in the mature period. Check eligibility, targeting and bid before changing exposure.')
  if (metrics.clicks < 20) return result('HOLD', 'Collect more evidence', 'Fewer than 20 mature clicks; a bid change is not supported by this review rule.')
  if (metrics.purchases === 0 && metrics.spend > 0) return result('LOWER', 'Consider lowering exposure', 'At least 20 mature clicks with no attributed purchase. Check relevance and cross-sales before reducing bids or excluding a term.', 0.9)
  if (metrics.purchases < 3 || metrics.acos === null) return result('HOLD', 'Collect more conversions', 'Fewer than three mature purchases; conversion efficiency is still uncertain.')
  if (metrics.acos > options.targetAcos * 1.2) return result('LOWER', 'Consider a small bid reduction', `Mature ACOS is above the ${options.targetAcos}% review target by more than 20%. This is an efficiency target, not verified break-even profitability.`, 0.9)
  if (metrics.purchases >= 5 && metrics.acos < options.targetAcos * 0.8) return result('RAISE', 'Consider a small bid increase', `At least five mature purchases with ACOS below 80% of the ${options.targetAcos}% review target. Check margin, stock and budget before testing more exposure.`, 1.1)
  return result('HOLD', 'Keep monitoring', 'Performance is near the review target or does not meet the evidence threshold for a bid change.')
}
