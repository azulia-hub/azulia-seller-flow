import type {
  CanonicalInventoryItem,
  InventoryProvenance,
} from '../../core/inventory/types'
import type { ParsedFbaInventoryRecord } from './fbaInventoryParser'
import type { ParsedFbmListingRecord } from './listingsInventoryParser'

export interface InventoryAdapterContext {
  readonly sellerAccount: string
  readonly marketplace?: string // default: 'amazon'
  readonly syncRunId?: string
  readonly observedAt?: string // default: current ISO
  readonly manualStockCounts?: Readonly<Record<string, number>>
}

/**
 * Maps raw parsed FBA records into canonical inventory domain items.
 */
export function fbaRecordsToCanonical(
  fbaRecords: readonly ParsedFbaInventoryRecord[],
  context: InventoryAdapterContext,
): CanonicalInventoryItem[] {
  const marketplace = context.marketplace || 'amazon'
  const observedAt = context.observedAt || new Date().toISOString()
  const manualCounts = context.manualStockCounts || {}

  const items: CanonicalInventoryItem[] = []

  for (const record of fbaRecords) {
    const channel = 'FBA'
    const id = JSON.stringify([context.sellerAccount,marketplace,record.sku,channel])

    const manualPhysical =
      typeof manualCounts[record.sku] === 'number'
        ? Math.max(0, manualCounts[record.sku])
        : null

    const provenance: InventoryProvenance = {
      source: 'amazon-sp-api-fba-inventory',
      observedAt,
      syncRunId: context.syncRunId,
      recordId: record.sku,
      rawPayload: record.rawSummary,
    }

    items.push({
      id,
      sellerAccount: context.sellerAccount,
      marketplace,
      sku: record.sku,
      fulfillmentChannel: channel,
      stockBasis: 'NETWORK_AVAILABLE',
      asin: record.asin,
      title: record.title,
      fnSku: record.fnSku,
      condition: record.condition,
      quantities: {
        ...record.quantities,
        manualPhysical,
      },
      provenance,
      updatedAt: record.lastUpdatedTime || observedAt,
    })
  }

  return items
}

/**
 * Maps parsed FBM listing records into canonical inventory domain items.
 */
export function fbmRecordsToCanonical(
  fbmRecords: readonly ParsedFbmListingRecord[],
  context: InventoryAdapterContext,
): CanonicalInventoryItem[] {
  const marketplace = context.marketplace || 'amazon'
  const observedAt = context.observedAt || new Date().toISOString()
  const manualCounts = context.manualStockCounts || {}

  const items: CanonicalInventoryItem[] = []

  for (const record of fbmRecords) {
    const availability = record.rawListing.fulfillmentAvailability
    const channel = Array.isArray(availability) && availability.some(value => value && typeof value === 'object' && value.fulfillmentChannelCode === 'DEFAULT') ? 'FBM' : 'LISTING'
    const id = JSON.stringify([context.sellerAccount,marketplace,record.sku,channel])

    const manualPhysical =
      typeof manualCounts[record.sku] === 'number'
        ? Math.max(0, manualCounts[record.sku])
        : null

    const provenance: InventoryProvenance = {
      source: 'amazon-sp-api-listings-fbm',
      observedAt,
      syncRunId: context.syncRunId,
      recordId: record.sku,
      rawPayload: record.rawListing,
    }

    items.push({
      id,
      sellerAccount: context.sellerAccount,
      marketplace,
      sku: record.sku,
      fulfillmentChannel: channel,
      stockBasis: 'MANUAL_PHYSICAL',
      imageUrl: (()=>{const summaries=record.rawListing.summaries;const summary=Array.isArray(summaries)?summaries[0]:null;const link=summary?.mainImage?.link;return typeof link==='string'&&link.startsWith('https://')?link:null})(),
      asin: record.asin,
      title: record.title,
      fnSku: null,
      condition: null,
      quantities: {
        ...record.quantities,
        manualPhysical,
      },
      provenance,
      updatedAt: observedAt,
    })
  }

  return items
}
