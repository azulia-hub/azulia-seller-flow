import type { SponsoredProductsReport } from '../../core/advertising/types'
import type { AdvertisingDataset, AdvertisingFact } from '../../core/advertising/workspace'

export interface AdsEntityLabel { readonly id: string; readonly name: string; readonly note?: string }
export interface AdsWorkspaceSource {
  readonly dataset: AdvertisingDataset
  readonly coveredFrom: string
  readonly coveredTo: string
  readonly observedAt: string
  readonly campaigns: ReadonlyMap<string, AdsEntityLabel>
  readonly adGroups: ReadonlyMap<string, AdsEntityLabel & { campaignId: string }>
  readonly products: ReadonlyMap<string, AdsEntityLabel & { asins: readonly string[] }>
  readonly identityNotices: readonly string[]
}
const sourceId = (value: unknown) => typeof value === 'string' ? value.trim() : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : ''

/** Exact SKU identity wins; an adapter alias is accepted only for one candidate. */
export function resolveAdvertisingSkus(advertised: readonly string[], financial: readonly string[], normalize?: (sku: string) => string): ReadonlyMap<string, string> {
  const candidates = new Map<string, Set<string>>()
  for (const sku of financial) { const key = normalize?.(sku) ?? sku, ids = candidates.get(key) ?? new Set<string>(); ids.add(sku); candidates.set(key, ids) }
  const result = new Map<string, string>()
  for (const sku of advertised) { const ids = candidates.get(normalize?.(sku) ?? sku); if (ids?.has(sku)) result.set(sku, sku); else if (ids?.size === 1) result.set(sku, [...ids][0]) }
  return result
}

export function resolveWorkspaceProducts(source: AdsWorkspaceSource, resolved: ReadonlyMap<string, string>): AdsWorkspaceSource {
  const products = new Map<string, AdsEntityLabel & { asins: readonly string[] }>()
  for (const product of source.products.values()) { const id = resolved.get(product.id) ?? product.id; products.set(id, { ...product, id, name: id, asins: [...new Set([...(products.get(id)?.asins ?? []), ...product.asins])] }) }
  return { ...source, products, dataset: { ...source.dataset, facts: source.dataset.facts.map(fact => ({ ...fact, productId: fact.productId ? resolved.get(fact.productId) ?? fact.productId : null })) } }
}

/** Keep source IDs when available. Name-only workbooks explicitly retain weaker identity. */
export function sponsoredWorkspaceSource(report: SponsoredProductsReport, resolvedProducts: ReadonlyMap<string, string> = new Map()): AdsWorkspaceSource {
  const campaigns = new Map<string, AdsEntityLabel>(), adGroups = new Map<string, AdsEntityLabel & { campaignId: string }>(), products = new Map<string, AdsEntityLabel & { asins: readonly string[] }>()
  let nameOnly = false
  const facts = report.rows.map((row, index): AdvertisingFact => {
    const campaignSource = sourceId(row.raw?.campaignId), groupSource = sourceId(row.raw?.adGroupId)
    const campaignId = campaignSource || `name:${JSON.stringify([row.portfolio, row.campaign])}`
    const adGroupId = groupSource ? JSON.stringify([campaignId, groupSource]) : `name:${JSON.stringify([campaignId, row.adGroup])}`
    if (!campaignSource || !groupSource) nameOnly = true
    campaigns.set(campaignId, { id: campaignId, name: row.campaign || campaignSource || 'Unnamed campaign', ...(!campaignSource ? { note: 'Source workbook supplies campaign names, not verified campaign IDs.' } : {}) })
    adGroups.set(adGroupId, { id: adGroupId, campaignId, name: row.adGroup || groupSource || 'Unnamed ad group' })
    const productId = resolvedProducts.get(row.advertisedSku) ?? row.advertisedSku
    products.set(productId, { id: productId, name: productId, asins: [...new Set([...(products.get(productId)?.asins ?? []), row.advertisedAsin].filter(Boolean))] })
    return { id: JSON.stringify([report.id, index]), datasetId: report.id, date: row.date, productId, campaignId, adGroupId,
      spend: row.spendExcludingTax, attributedSales: row.attributedSales, promotedSales: row.advertisedSkuSales, otherProductSales: row.otherSkuSales,
      impressions: row.impressions, clicks: row.clicks, purchases: row.orders, units: row.units, raw: row.raw }
  })
  return { dataset: { id: report.id, grain: 'PRODUCT', currency: 'INR', moneyDecimals: 2, timezone: 'Asia/Kolkata', taxBasis: 'EXCLUDING_TAX', attributionDays: 7, facts },
    coveredFrom: report.minDate, coveredTo: report.maxDate, observedAt: report.importedAt, campaigns, adGroups, products,
    identityNotices: nameOnly ? ['Some workbook identities are name-based. Current campaign status and bids cannot be inferred from these names.'] : [] }
}
