import type { StockQuantities } from '../../core/inventory/types'
import type { RawAmazonListingItem } from './types'

export interface ParsedFbmListingRecord {
  readonly sku: string
  readonly asin: string | null
  readonly title: string | null
  readonly status: string | null
  readonly quantities: StockQuantities
  readonly rawListing: Readonly<Record<string, unknown>>
}

function parseQuantity(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean' || String(value).trim() === '') return null
  const num = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isSafeInteger(num) || num < 0) return null
  return num
}

/**
 * Parse an Amazon Listings Item or merchant availability response.
 *
 * Invariant:
 * - Merchant Fulfilled (FBM) stock represents 'listed' advertised availability.
 * - In FBM, Amazon FC 'available' is null because Amazon does not hold physical stock.
 */
export function parseFbmListingRecord(rawItem: unknown): ParsedFbmListingRecord | null {
  if (!rawItem || typeof rawItem !== 'object') return null

  const row = rawItem as RawAmazonListingItem & Record<string, unknown>
  const rawSku = row.sku || row['sellerSku'] || row['sellerSKU']
  const sku = typeof rawSku === 'string' ? rawSku.trim() : null
  if (!sku) return null

  // Extract quantity from offers or fulfillmentAvailability
  let listedQuantity: number | null = null

  const availability = Array.isArray(row.fulfillmentAvailability) ? row.fulfillmentAvailability as Record<string,unknown>[] : []
  const merchant = availability.filter(value => value.fulfillmentChannelCode === 'DEFAULT')
  const quantities = merchant.map(value => parseQuantity(value.quantity))
  if (quantities.length && quantities.every(value => value !== null)) listedQuantity = quantities.reduce<number>((total,value) => total + value!,0)

  const asin =
    typeof row.asin === 'string'
      ? row.asin.trim()
      : Array.isArray(row.summaries) && typeof row.summaries[0]?.asin === 'string'
        ? row.summaries[0].asin.trim()
        : null

  const title =
    Array.isArray(row.summaries) && typeof row.summaries[0]?.itemName === 'string'
      ? row.summaries[0].itemName.trim()
      : typeof row['itemName'] === 'string'
        ? (row['itemName'] as string).trim()
        : null

  const status = typeof row.status === 'string' ? row.status.trim() : null

  const stock: StockQuantities = {
    available: null, // FBM stock is not held in Amazon FC
    reserved: null,
    inbound: null,
    unsellable: null,
    listed: listedQuantity,
    manualPhysical: null,
    rawQuantities: row,
  }

  return {
    sku,
    asin,
    title,
    status,
    quantities: stock,
    rawListing: row as Readonly<Record<string, unknown>>,
  }
}
