import specifications from './specifications.json' with { type: 'json' }
import type { AdvertisingFact } from '../../core/advertising/workspace'
import type { AdsWorkspaceSource, AdsEntityLabel } from './workspaceSource'
import { validAdsDate, type AdsRange } from './report.ts'

export type AdsReportKind = keyof typeof specifications.reports
export type AdsSupplementalKind = Exclude<AdsReportKind, 'advertisedProduct'>
export const adsReportKinds = Object.keys(specifications.reports) as AdsReportKind[]
export const adsConfigurationVersion = (kind: AdsReportKind): number => specifications.reports[kind].version
export function adsReportKind(value: unknown): AdsReportKind {
  if (typeof value !== 'string' || !Object.hasOwn(specifications.reports, value)) throw new Error('Unsupported advertising report kind.')
  return value as AdsReportKind
}
export function reportSpecification(range: AdsRange, kind: AdsReportKind) {
  const spec = specifications.reports[kind]
  return { name: `Azulia ${kind} ${range.from} ${range.to}`, startDate: range.from, endDate: range.to, configuration: { ...spec.configuration, groupBy: [...spec.configuration.groupBy], columns: [...spec.configuration.columns] } }
}
export interface AdsSupplementalReport {
  readonly id: string
  readonly kind: AdsSupplementalKind
  readonly configurationVersion: number
  readonly profileId: string
  readonly minDate: string
  readonly maxDate: string
  readonly importedAt: string
  readonly rows: readonly Readonly<Record<string, unknown>>[]
}
const string = (value: unknown): string => typeof value === 'string' ? value.trim() : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : ''
const requiredNumber = (raw: Readonly<Record<string, unknown>>, name: string, index: number): number => {
  const value = raw[name]
  if ((typeof value !== 'number' && typeof value !== 'string') || typeof value === 'string' && !value.trim()) throw new Error(`Advertising row ${index + 1} is missing ${name}. Previous results retained.`)
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Advertising row ${index + 1} has invalid ${name}. No rows were discarded.`)
  return parsed
}
export function parseSupplementalRows(value: unknown, range: AdsRange, kind: AdsSupplementalKind): readonly Readonly<Record<string, unknown>>[] {
  if (!['searchTerm', 'purchasedProduct', 'targeting'].includes(kind)) throw new Error('Unsupported supplemental advertising report.')
  if (!Array.isArray(value)) throw new Error('Advertising source must be a JSON array. Previous results retained.')
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Advertising row ${index + 1} is invalid. No rows were discarded.`)
    const raw = item as Record<string, unknown>, date = string(raw.date)
    if (!validAdsDate(date) || date < range.from || date > range.to || !string(raw.campaignId) || !string(raw.adGroupId)) throw new Error(`Advertising row ${index + 1} has missing identity or invalid dates. Previous results retained.`)
    if (kind === 'searchTerm' && !string(raw.searchTerm)) throw new Error(`Search-term row ${index + 1} has no customer search. No rows were discarded.`)
    if (kind === 'purchasedProduct' && (!/^[A-Z0-9]{10}$/i.test(string(raw.advertisedAsin)) || !/^[A-Z0-9]{10}$/i.test(string(raw.purchasedAsin)))) throw new Error(`Purchased-product row ${index + 1} has missing advertised/purchased identity. Previous results retained.`)
    for (const field of ['sales7d', 'purchases7d', 'unitsSoldClicks7d']) requiredNumber(raw, field, index)
    if (kind === 'purchasedProduct') for (const field of ['salesOtherSku7d', 'purchasesOtherSku7d', 'unitsSoldOtherSku7d']) if (raw[field] !== undefined) requiredNumber(raw, field, index)
    if (kind !== 'purchasedProduct') for (const field of ['impressions', 'clicks', 'cost', 'attributedSalesSameSku7d']) requiredNumber(raw, field, index)
    if (kind === 'searchTerm') requiredNumber(raw, 'salesOtherSku7d', index)
    // The complete source object is retained, including future/unknown fields.
    return { ...raw }
  })
}
export function replaceSupplementalWindow(previous: AdsSupplementalReport | null, range: AdsRange, rows: AdsSupplementalReport['rows'], profileId: string, kind: AdsSupplementalKind, importedAt: string): AdsSupplementalReport {
  const before = new Date(Date.parse(range.from) - 86400000).toISOString().slice(0, 10), after = new Date(Date.parse(range.to) + 86400000).toISOString().slice(0, 10)
  const configurationVersion = specifications.reports[kind].version
  const contiguous = previous && previous.profileId === profileId && previous.kind === kind && previous.configurationVersion === configurationVersion && previous.maxDate >= before && previous.minDate <= after
  return { id: `ads-${kind}:${profileId}:v${configurationVersion}`, profileId, kind, configurationVersion, importedAt, minDate: contiguous && previous.minDate < range.from ? previous.minDate : range.from,
    maxDate: contiguous && previous.maxDate > range.to ? previous.maxDate : range.to,
    rows: [...(contiguous ? previous.rows.filter(row => string(row.date) < range.from || string(row.date) > range.to) : []), ...rows].sort((a, b) => string(a.date).localeCompare(string(b.date))) }
}
export function supplementalWorkspaceSource(report: AdsSupplementalReport): AdsWorkspaceSource {
  const campaigns = new Map<string, AdsEntityLabel>(), adGroups = new Map<string, AdsEntityLabel & { campaignId: string }>(), products = new Map<string, AdsEntityLabel & { asins: readonly string[] }>()
  const facts = parseSupplementalRows(report.rows, { from: report.minDate, to: report.maxDate }, report.kind).map((raw, index): AdvertisingFact => {
    const campaignId = string(raw.campaignId), groupId = string(raw.adGroupId), adGroupId = JSON.stringify([campaignId, groupId]), productId = string(raw.advertisedSku) || null
    campaigns.set(campaignId, { id: campaignId, name: string(raw.campaignName) || campaignId })
    adGroups.set(adGroupId, { id: adGroupId, campaignId, name: string(raw.adGroupName) || groupId })
    if (productId) products.set(productId, { id: productId, name: productId, asins: [string(raw.advertisedAsin)].filter(Boolean) })
    return { id: JSON.stringify([report.id, index]), datasetId: report.id, date: string(raw.date), productId, campaignId, adGroupId, targetId: string(raw.keywordId) || (string(raw.keyword) || string(raw.targeting) ? `expression:${JSON.stringify([string(raw.keywordType), string(raw.keyword), string(raw.targeting)])}` : null),
      searchTerm: report.kind === 'searchTerm' ? string(raw.searchTerm) : null, purchasedProductId: report.kind === 'purchasedProduct' ? string(raw.purchasedAsin).toUpperCase() : null,
      spend: report.kind === 'purchasedProduct' ? null : Number(raw.cost), attributedSales: report.kind === 'purchasedProduct' ? raw.salesOtherSku7d === undefined ? null : Number(raw.salesOtherSku7d) : Number(raw.sales7d),
      promotedSales: report.kind === 'purchasedProduct' ? null : Number(raw.attributedSalesSameSku7d), otherProductSales: report.kind === 'searchTerm' ? Number(raw.salesOtherSku7d) : null,
      impressions: report.kind === 'purchasedProduct' ? null : Number(raw.impressions), clicks: report.kind === 'purchasedProduct' ? null : Number(raw.clicks), purchases: report.kind === 'purchasedProduct' ? raw.purchasesOtherSku7d === undefined ? null : Number(raw.purchasesOtherSku7d) : Number(raw.purchases7d), units: report.kind === 'purchasedProduct' ? raw.unitsSoldOtherSku7d === undefined ? null : Number(raw.unitsSoldOtherSku7d) : Number(raw.unitsSoldClicks7d), raw }
  })
  return { dataset: { id: report.id, grain: report.kind === 'searchTerm' ? 'SEARCH_TERM' : report.kind === 'targeting' ? 'TARGET' : 'PURCHASED_PRODUCT', currency: 'INR', moneyDecimals: 2, timezone: 'Asia/Kolkata', taxBasis: 'EXCLUDING_TAX', attributionDays: 7, facts },
    coveredFrom: report.minDate, coveredTo: report.maxDate, observedAt: report.importedAt, campaigns, adGroups, products, identityNotices: [] }
}
