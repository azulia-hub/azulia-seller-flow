import { productTitles } from './productTitles'
import type { CanonicalFinancialEvent } from '../data/types'

export type ReportSearchField = 'ALL' | 'SKU' | 'IDENTITY' | 'TITLE' | 'CITY' | 'ORDER' | 'LOCATION'

export interface ReportSearchDocument {
  readonly kind: 'PRODUCT' | 'ORDER' | 'LOCATION' | 'TRANSACTION'
  readonly id: string
  readonly label: string
  readonly detail: string
  readonly sku?: string
  readonly orderId?: string
  readonly eventIds: readonly string[]
  readonly skuSearchText?: string
  readonly identitySearchText?: string
  readonly citySearchText?: string
  readonly titleSearchText?: string
  readonly searchText: string
}

export function buildReportSearchIndex(events: readonly CanonicalFinancialEvent[], options: {
  productAliases?: readonly { sku: string; aliases: readonly string[] }[]
  productTitleFields?: readonly string[]
  normalizeSku?: (sku: string) => string
} = {}): ReportSearchDocument[] {
  const products = new Map<string, CanonicalFinancialEvent[]>()
  const orders = new Map<string, CanonicalFinancialEvent[]>()
  const locations = new Map<string, CanonicalFinancialEvent[]>()
  const documents: ReportSearchDocument[] = []
  const append = (map: Map<string, CanonicalFinancialEvent[]>, key: string, event: CanonicalFinancialEvent) => {
    const rows = map.get(key)
    if (rows) rows.push(event); else map.set(key, [event])
  }
  for (const event of events) {
    if (event.sku) append(products, event.sku, event)
    if (event.orderId) append(orders, event.orderId, event)
    if (event.city || event.state) append(locations, JSON.stringify([event.city?.trim().toLowerCase() ?? '', event.state?.trim().toLowerCase() ?? '']), event)
    if (!event.sku && !event.orderId) documents.push({ kind: 'TRANSACTION', id: event.id, label: event.rawDescription || event.rawType || event.amountType,
      detail: `${event.date ?? 'Undated'} · ${event.classified ? 'Account transaction' : 'Needs classification'}`, eventIds: [event.id],
      searchText: [event.rawDescription, event.rawType, event.amountType, event.city, event.state].filter(Boolean).join(' ').toLowerCase() })
  }
  const key = (sku: string) => (options.normalizeSku?.(sku) ?? sku).trim()
  const identities = new Map<string, string[]>()
  for (const sku of products.keys()) identities.set(key(sku), [...(identities.get(key(sku)) ?? []), sku])
  const aliases = new Map<string, Set<string>>()
  const skuAliases = new Map<string, Set<string>>()
  const identityAliases = new Map<string, Set<string>>()
  for (const item of options.productAliases ?? []) {
    const matches = identities.get(key(item.sku)) ?? []
    if (matches.length !== 1) continue
    const values = aliases.get(matches[0]) ?? new Set<string>()
    const sourceAliases = [item.sku, ...item.aliases]
    sourceAliases.filter(alias => Boolean(alias) && alias !== matches[0]).forEach(alias => values.add(alias))
    aliases.set(matches[0], values)
    const skuValues = skuAliases.get(matches[0]) ?? new Set<string>()
    skuValues.add(item.sku); skuAliases.set(matches[0], skuValues)
    const identityValues = identityAliases.get(matches[0]) ?? new Set<string>()
    item.aliases.filter(Boolean).forEach(alias => identityValues.add(alias))
    identityAliases.set(matches[0], identityValues)
  }
  for (const [sku, rows] of products) {
    const names = productTitles(rows, options.productTitleFields)
    documents.push({ kind: 'PRODUCT', id: sku, sku, label: names[0] || sku, detail: [sku, ...aliases.get(sku) ?? []].join(' · '), eventIds: rows.map(row => row.id),
      skuSearchText: [sku, ...skuAliases.get(sku) ?? []].join(' ').toLowerCase(),
      identitySearchText: [...identityAliases.get(sku) ?? []].join(' ').toLowerCase(),
      titleSearchText: names.join(' ').toLowerCase(),
      searchText: [sku, ...names, ...aliases.get(sku) ?? []].join(' ').toLowerCase() })
  }
  for (const [orderId, rows] of orders) {
    const skus = [...new Set(rows.flatMap(row => row.sku ? [row.sku] : []))]
    const location = rows.find(row => row.city || row.state)
    documents.push({ kind: 'ORDER', id: orderId, orderId, label: orderId, detail: [skus.join(', '), location?.city, location?.state].filter(Boolean).join(' · '), eventIds: rows.map(row => row.id),
      searchText: [orderId, ...skus, ...productTitles(rows, options.productTitleFields), ...rows.flatMap(row => [row.city, row.state, row.rawDescription, row.rawType])].filter(Boolean).join(' ').toLowerCase() })
  }
  for (const [id, rows] of locations) {
    const label = [rows[0].city, rows[0].state].filter(Boolean).join(', ')
    documents.push({ kind: 'LOCATION', id, label, citySearchText: (rows[0].city ?? '').trim().toLowerCase(), detail: 'Source transactions at this location', eventIds: rows.map(row => row.id), searchText: label.toLowerCase() })
  }
  return documents
}

export function searchReport(documents: readonly ReportSearchDocument[], query: string, limit = 30, field: ReportSearchField = 'ALL') {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!tokens.length) return { total: 0, results: [] as ReportSearchDocument[] }
  const textFor = (document: ReportSearchDocument): string => {
    switch (field) {
      case 'SKU': return document.kind === 'PRODUCT' ? document.skuSearchText ?? document.sku?.toLowerCase() ?? '' : ''
      case 'IDENTITY': return document.kind === 'PRODUCT' ? document.identitySearchText ?? '' : ''
      case 'TITLE': return document.kind === 'PRODUCT' ? document.titleSearchText ?? '' : ''
      case 'CITY': return document.kind === 'LOCATION' ? document.citySearchText ?? '' : ''
      case 'ORDER': return document.kind === 'ORDER' ? document.orderId?.toLowerCase() ?? '' : ''
      case 'LOCATION': return document.kind === 'LOCATION' ? document.searchText : ''
      default: return document.searchText
    }
  }
  const matches = documents.filter(document => tokens.every(token => textFor(document).includes(token)))
  const order = { PRODUCT: 0, ORDER: 1, LOCATION: 2, TRANSACTION: 3 }
  const normalized = query.trim().toLowerCase()
  matches.sort((a, b) => Number(b.label.toLowerCase() === normalized || b.id.toLowerCase() === normalized) - Number(a.label.toLowerCase() === normalized || a.id.toLowerCase() === normalized)
    || order[a.kind] - order[b.kind] || a.label.localeCompare(b.label))
  return { total: matches.length, results: matches.slice(0, Math.max(0, limit)) }
}
