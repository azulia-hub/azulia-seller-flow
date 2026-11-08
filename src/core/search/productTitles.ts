import type { CanonicalFinancialEvent } from '../data/types'

const defaultTitleFields = ['title', 'product title', 'item title', 'product name', 'item name']
const fieldKey = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, '')

/** Read preserved, generic title fields without changing canonical source evidence. */
export function productTitles(events: readonly CanonicalFinancialEvent[], titleFields: readonly string[] = defaultTitleFields): string[] {
  const fields = new Set(titleFields.map(fieldKey))
  const explicit = events.flatMap(event => Object.entries(event.raw).flatMap(([key, value]) =>
    fields.has(fieldKey(key)) && typeof value === 'string' && value.trim() ? [value.trim()] : []))
  const descriptions = events.filter(event => event.descriptionIsProductTitle !== false && event.event === 'SALE' && event.amountType === 'PRODUCT_REVENUE').flatMap(event => event.rawDescription?.trim() ? [event.rawDescription.trim()] : [])
  return [...new Set([...explicit, ...descriptions])]
}

/** Only actual supplied image locations; never invent URLs from product identifiers. */
export function productImage(events: readonly CanonicalFinancialEvent[]): string | null {
  for (const event of events) for (const [key, value] of Object.entries(event.raw)) {
    if (!['productimage','imageurl','mainimage'].includes(fieldKey(key)) || typeof value !== 'string') continue
    if (/^https:\/\/[^\s/@]+(?:\/[^\s]*)?$/.test(value)) return value
  }
  return null
}
