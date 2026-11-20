import type { AdvertisingRecommendation } from '../../../core/advertising/recommendations'
export function RecommendationNote({ value, formatMoney }: { value?: AdvertisingRecommendation; formatMoney: (value: number) => string }) {
  if (!value) return <span className="adsw-cell-sub">Review evidence is not available.</span>
  return <div className={`adsw-recommendation adsw-recommendation-${value.action.toLowerCase()}`}><strong>{value.text}</strong>{value.suggestedBid !== null ? <span>Test bid: {formatMoney(value.suggestedBid)} · 10% step</span> : null}<span>{value.reason}</span><small>Suggestion only · review before applying in Amazon</small></div>
}
