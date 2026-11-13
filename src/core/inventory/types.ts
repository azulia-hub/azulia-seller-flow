/**
 * Pure generic inventory domain types.
 *
 * Invariant rules:
 * - Pure TypeScript: zero dependencies on React, Dexie, DuckDB, Node, DOM, or marketplace terminology.
 * - Identity: sellerAccount + marketplace + sku + fulfillmentChannel.
 * - Stock categories must remain distinct: available, reserved, inbound, unsellable, listed, manual physical.
 * - Unknown quantities MUST be null, never silently coerced to 0.
 * - Provenance and timestamps are preserved for auditability and reconciliation.
 */

export type FulfillmentChannelType = 'FBA' | 'FBM' | 'MANUAL' | string

export interface InventoryIdentity {
  readonly sellerAccount: string
  readonly marketplace: string
  readonly sku: string
  readonly fulfillmentChannel: FulfillmentChannelType
  /** Whether available represents physical sellable stock (not advertised listing quantity). */
  readonly stockBasis?: 'NETWORK_AVAILABLE' | 'MANUAL_PHYSICAL'
}

export interface InboundBreakdown {
  readonly working: number | null
  readonly shipped: number | null
  readonly receiving: number | null
  readonly total: number | null
}

export interface ReservedBreakdown {
  readonly customerOrders: number | null
  readonly fcTransfers: number | null
  readonly fcProcessing: number | null
  readonly total: number | null
}

export interface UnsellableBreakdown {
  readonly customerDamaged: number | null
  readonly warehouseDamaged: number | null
  readonly distributorDamaged: number | null
  readonly carrierDamaged: number | null
  readonly defective: number | null
  readonly expired: number | null
  readonly total: number | null
}

export interface StockQuantities {
  /** Unreserved, sellable units currently on hand in the fulfillment network. */
  readonly available: number | null
  /** Reserved stock (allocated to pending orders, transfers, or processing). */
  readonly reserved: number | null
  /** Detailed breakdown of reserved units if supplied by source. */
  readonly reservedBreakdown?: ReservedBreakdown | null
  /** Inbound units in transit or preparation. */
  readonly inbound: number | null
  /** Detailed breakdown of inbound pipeline if supplied by source. */
  readonly inboundBreakdown?: InboundBreakdown | null
  /** Damaged, defective, or expired units that cannot be sold. */
  readonly unsellable: number | null
  /** Detailed breakdown of unsellable units if supplied by source. */
  readonly unsellableBreakdown?: UnsellableBreakdown | null
  /** Quantity offered/advertised on merchant listings (e.g. FBM active offer). */
  readonly listed: number | null
  /** Seller's physical warehouse on-hand count entered manually or synced locally. */
  readonly manualPhysical: number | null
  /** Preserved raw/unclassified quantities from source for future extensions. */
  readonly rawQuantities?: Readonly<Record<string, unknown>> | null
}

export interface InventoryProvenance {
  readonly source: string
  readonly observedAt: string
  readonly syncRunId?: string
  readonly recordId?: string
  readonly rawPayload?: Readonly<Record<string, unknown>> | null
}

export interface CanonicalInventoryItem extends InventoryIdentity {
  /** Deterministic composite identifier: `${sellerAccount}:${marketplace}:${sku}:${fulfillmentChannel}` */
  readonly id: string
  readonly imageUrl?: string | null
  readonly asin?: string | null
  readonly title?: string | null
  readonly fnSku?: string | null
  readonly condition?: string | null
  readonly quantities: StockQuantities
  readonly provenance: InventoryProvenance
  readonly updatedAt: string
}

export type DemandWindowDays = 7 | 14 | 30 | 60 | 90

export interface ShippedDayPoint {
  readonly date: string // ISO date (YYYY-MM-DD)
  readonly shippedUnits: number
  /** Whether the item had positive usable stock on this day (false indicates a stockout day). */
  readonly isStocked?: boolean
}

export type DemandConfidenceStatus =
  | 'NO_DATA'
  | 'HIGH_CONFIDENCE'
  | 'PARTIAL_COVERAGE'
  | 'STOCKOUT_BIASED'
  | 'NO_OBSERVED_SALES'
  | 'INSUFFICIENT_HISTORY'

export interface DemandMetrics {
  readonly windowDays: DemandWindowDays
  readonly observedDays: number
  readonly coverageRatio: number // observedDays / windowDays
  readonly totalShippedUnits: number
  /** Average daily shipped units over observed days. Null if observedDays === 0. */
  readonly dailyDemand: number | null
  readonly stockoutDaysCount: number
  readonly hasStockoutBias: boolean
  readonly confidence: DemandConfidenceStatus
  readonly notes: readonly string[]
}

export interface ReplenishmentConfig {
  /** Vendor/production lead time in calendar days from order placement to delivery. */
  readonly leadTimeDays: number
  /** Safety buffer in calendar days to cushion demand surges or supplier delays. */
  readonly safetyStockDays: number
  /** Target coverage window in calendar days (cycle stock duration). */
  readonly replenishmentCoverageDays: number
  /** Minimum Order Quantity (MOQ) imposed by manufacturer/supplier. Default: 0. */
  readonly minOrderQuantity?: number
  /** Case pack size / multiple for purchasing. Must be >= 1. Default: 1. */
  readonly packMultiple?: number
  /** Whether inbound units in 'shipped' state qualify as inventory arriving in time. Default: true. */
  readonly includeInboundShipped?: boolean
  /** Whether inbound units in 'receiving' state qualify as inventory arriving in time. Default: true. */
  readonly includeInboundReceiving?: boolean
  /** Whether inbound units in 'working' state qualify as inventory arriving in time. Default: false. */
  readonly includeInboundWorking?: boolean
  /** Whether manual physical warehouse stock is added to usable stock. Default: false. */
  readonly includeManualPhysical?: boolean
  /** Explicit seller assumption that selected inbound will arrive before replenishment is needed. */
  readonly inboundArrivalConfirmed?: boolean
}

export type ReplenishmentUrgency =
  | 'OUT_OF_STOCK'
  | 'CRITICAL_REORDER'
  | 'REORDER_SOON'
  | 'HEALTHY'
  | 'EXCESS_STOCK'
  | 'UNAVAILABLE'

export interface ReplenishmentRecommendation {
  readonly sku: string
  readonly identity: InventoryIdentity
  /** Sellable stock on hand (+ manual warehouse stock if configured). */
  readonly usableStock: number | null
  /** Inbound inventory qualifying as arriving within replenishment window. */
  readonly qualifyingInbound: number | null
  /** Daily demand rate applied for calculations. */
  readonly dailyDemand: number | null
  /** Days of usable stock remaining at current demand rate. Null if dailyDemand is 0 or null. */
  readonly stockCoverDays: number | null
  /** Reorder point = dailyDemand * (leadTimeDays + safetyStockDays). */
  readonly reorderPoint: number | null
  /** Target stock = dailyDemand * (leadTimeDays + safetyStockDays + replenishmentCoverageDays). */
  readonly targetStock: number | null
  /** Target stock - usableStock - qualifyingInbound before MOQ and pack multiple rounding. */
  readonly rawSuggestedQuantity: number | null
  /** Final recommended purchase order quantity after applying MOQ and pack multiple rounding. */
  readonly suggestedQuantity: number | null
  /** Estimated calendar days remaining until complete stockout at current demand. */
  readonly daysUntilStockout: number | null
  readonly urgency: ReplenishmentUrgency
  /** Explicit list of missing inputs or constraints when urgency is UNAVAILABLE or calculation is degraded. */
  readonly unavailableReasons: readonly string[]
  readonly calculationTimestamp: string
}
