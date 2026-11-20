import type { SponsoredProductRow, SponsoredProductsReport } from '../../core/advertising/types'
import specifications from './specifications.json' with { type: 'json' }

export interface AdsRange { from: string; to: string }
export const adsColumns = specifications.reports.advertisedProduct.configuration.columns
export function validAdsDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
export function shiftAdsDate(day: string, amount: number): string {
  return new Date(Date.parse(day) + amount * 86400000).toISOString().slice(0, 10)
}
/** Amazon v3 advertised-product reports accept at most 31 inclusive days. */
export function adsWindows(range: AdsRange, today: string): AdsRange[] {
  if (!validAdsDate(range.from) || !validAdsDate(range.to) || range.from > range.to || range.to > today || range.from < shiftAdsDate(today, -94)) throw new Error('Choose advertising dates within the last 95 days, ending today or earlier. Previously saved reports are retained.')
  const result: AdsRange[] = []
  for (let from = range.from; from <= range.to;) {
    const to = shiftAdsDate(from, 30) < range.to ? shiftAdsDate(from, 30) : range.to
    result.push({ from, to }); from = shiftAdsDate(to, 1)
  }
  return result
}
export function adsReportRequest(range: AdsRange) {
  return { name: `Azulia advertised products ${range.from} ${range.to}`, startDate: range.from, endDate: range.to,
    configuration: { ...specifications.reports.advertisedProduct.configuration, groupBy: [...specifications.reports.advertisedProduct.configuration.groupBy], columns: [...adsColumns] } }
}
/** Missing/invalid metrics reject the complete observation; they never become zero. */
export function parseAdsRows(value: unknown, range: AdsRange): SponsoredProductRow[] {
  if (!Array.isArray(value)) throw new Error('Amazon Ads report is not an array. Previous results retained.')
  return value.map((source, index) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error(`Advertising row ${index + 1} is invalid. No rows were discarded.`)
    const raw = source as Record<string, unknown>
    const numeric = (name: string) => {
      const value = raw[name]
      if ((typeof value !== 'number' && typeof value !== 'string') || value === '' || (typeof value === 'string' && !value.trim())) throw new Error(`Advertising row ${index + 1} is missing ${name}. Previous results retained.`)
      const result = Number(value)
      if (!Number.isFinite(result) || result < 0) throw new Error(`Advertising row ${index + 1} has invalid ${name}. Previous results retained.`)
      return result
    }
    const string = (name: string) => typeof raw[name] === 'string' || typeof raw[name] === 'number' ? String(raw[name]).trim() : ''
    const date = string('date')
    if (!validAdsDate(date) || date < range.from || date > range.to || !string('advertisedSku')) throw new Error(`Advertising row ${index + 1} is missing its date/SKU or is outside the requested dates. No rows were discarded.`)
    return { raw: { ...raw }, date, portfolio: string('portfolioId'), campaign: string('campaignName') || string('campaignId'), adGroup: string('adGroupName') || string('adGroupId'),
      advertisedSku: string('advertisedSku'), advertisedAsin: string('advertisedAsin').toUpperCase(), impressions: numeric('impressions'), clicks: numeric('clicks'), spendExcludingTax: numeric('cost'),
      attributedSales: numeric('sales7d'), advertisedSkuSales: numeric('attributedSalesSameSku7d'), otherSkuSales: numeric('salesOtherSku7d'), orders: numeric('purchases7d'), units: numeric('unitsSoldClicks7d') }
  })
}
/** Replace whole completed date windows, including empty days; never append overlapping spend. */
export function replaceAdsWindow(previous: SponsoredProductsReport | null, range: AdsRange, rows: readonly SponsoredProductRow[], profileId: string, now: string): SponsoredProductsReport {
  const contiguous = previous && previous.id === `ads-api:${profileId}` && shiftAdsDate(previous.maxDate, 1) >= range.from && shiftAdsDate(range.to, 1) >= previous.minDate
  const retained = contiguous ? previous.rows.filter(row => row.date < range.from || row.date > range.to) : []
  return { id: `ads-api:${profileId}`, fileName: 'Amazon Ads API · Sponsored Products · 7-day click attribution', importedAt: now,
    minDate: contiguous && previous.minDate < range.from ? previous.minDate : range.from,
    maxDate: contiguous && previous.maxDate > range.to ? previous.maxDate : range.to,
    rows: [...retained, ...rows].sort((a, b) => a.date.localeCompare(b.date) || a.advertisedSku.localeCompare(b.advertisedSku)) }
}
