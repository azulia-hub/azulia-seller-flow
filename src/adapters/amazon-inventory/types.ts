/**
 * Amazon SP-API Inventory and Listings raw schema interfaces.
 *
 * References:
 * - Selling Partner API for FBA Inventory (v1 / 2020-07-01 / 2024-10-01)
 * - Selling Partner API for Listings Items (2021-08-01)
 */

export interface RawAmazonInventoryDetails {
  readonly fulfillableQuantity?: number | string | null
  readonly inboundWorkingQuantity?: number | string | null
  readonly inboundShippedQuantity?: number | string | null
  readonly inboundReceivingQuantity?: number | string | null
  readonly reservedQuantity?: {
    readonly totalReservedQuantity?: number | string | null
    readonly pendingCustomerOrderQuantity?: number | string | null
    readonly pendingTransshipmentQuantity?: number | string | null
    readonly fcProcessingQuantity?: number | string | null
    readonly [extraKey: string]: unknown
  } | null
  readonly unfulfillableQuantity?: {
    readonly totalUnfulfillableQuantity?: number | string | null
    readonly customerDamagedQuantity?: number | string | null
    readonly warehouseDamagedQuantity?: number | string | null
    readonly distributorDamagedQuantity?: number | string | null
    readonly carrierDamagedQuantity?: number | string | null
    readonly defectiveQuantity?: number | string | null
    readonly expiredQuantity?: number | string | null
    readonly [extraKey: string]: unknown
  } | null
  readonly researchingQuantity?: {
    readonly totalResearchingQuantity?: number | string | null
    readonly [extraKey: string]: unknown
  } | null
  readonly [extraKey: string]: unknown
}

export interface RawAmazonInventorySummary {
  readonly asin?: string | null
  readonly fnSku?: string | null
  readonly sellerSku?: string | null
  readonly condition?: string | null
  readonly inventoryDetails?: RawAmazonInventoryDetails | null
  readonly lastUpdatedTime?: string | null
  readonly productName?: string | null
  readonly totalQuantity?: number | string | null
  readonly [extraKey: string]: unknown
}

export interface RawAmazonFbaInventoryResponse {
  readonly pagination?: {
    readonly nextToken?: string | null
    readonly [extraKey: string]: unknown
  } | null
  readonly payload?: {
    readonly inventorySummaries?: readonly RawAmazonInventorySummary[] | null
    readonly granularity?: {
      readonly granularityType?: string | null
      readonly granularityId?: string | null
      readonly [extraKey: string]: unknown
    } | null
    readonly [extraKey: string]: unknown
  } | null
  readonly nextToken?: string | null
  readonly errors?: readonly {
    readonly code?: string
    readonly message?: string
    readonly details?: string
    readonly [extraKey: string]: unknown
  }[] | null
  readonly [extraKey: string]: unknown
}

export interface RawAmazonListingOffer {
  readonly price?: {
    readonly currency?: string | null
    readonly amount?: string | number | null
  } | null
  readonly quantity?: number | string | null
  readonly fulfillmentAvailability?: readonly {
    readonly fulfillmentChannelCode?: string | null // e.g. 'DEFAULT', 'AMAZON_NA', 'AMAZON_IN'
    readonly quantity?: number | string | null
    readonly [extraKey: string]: unknown
  }[] | null
  readonly [extraKey: string]: unknown
}

export interface RawAmazonListingItem {
  readonly sku?: string | null
  readonly asin?: string | null
  readonly status?: string | null // 'BUYABLE', 'DISCOVERABLE', etc.
  readonly offers?: readonly RawAmazonListingOffer[] | null
  readonly summaries?: readonly {
    readonly itemName?: string | null
    readonly asin?: string | null
    readonly status?: readonly string[] | null
    readonly conditionType?: string | null
    readonly [extraKey: string]: unknown
  }[] | null
  readonly [extraKey: string]: unknown
}
