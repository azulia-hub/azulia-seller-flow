import type {
  InboundBreakdown,
  ReservedBreakdown,
  StockQuantities,
  UnsellableBreakdown,
} from '../../core/inventory/types'
import type {
  RawAmazonFbaInventoryResponse,
  RawAmazonInventoryDetails,
  RawAmazonInventorySummary,
} from './types'

export interface ParsedFbaInventoryRecord {
  readonly sku: string
  readonly asin: string | null
  readonly fnSku: string | null
  readonly title: string | null
  readonly condition: string | null
  readonly quantities: StockQuantities
  readonly lastUpdatedTime: string | null
  readonly rawSummary: Readonly<Record<string, unknown>>
}

export interface ParsedFbaInventoryPage {
  readonly items: readonly ParsedFbaInventoryRecord[]
  readonly nextToken: string | null
  readonly totalReportedCount: number
  readonly isComplete: boolean
  readonly rawResponse: Readonly<Record<string, unknown>>
}

function parseQuantity(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean' || String(value).trim() === '') return null
  const num = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isSafeInteger(num) || num < 0) return null
  return num
}

function parseInboundBreakdown(details?: RawAmazonInventoryDetails | null): InboundBreakdown {
  const working = parseQuantity(details?.inboundWorkingQuantity)
  const shipped = parseQuantity(details?.inboundShippedQuantity)
  const receiving = parseQuantity(details?.inboundReceivingQuantity)

  let total: number | null = null
  if (working !== null && shipped !== null && receiving !== null) {
    total = (working ?? 0) + (shipped ?? 0) + (receiving ?? 0)
  }

  return { working, shipped, receiving, total }
}

function parseReservedBreakdown(details?: RawAmazonInventoryDetails | null): ReservedBreakdown {
  const res = details?.reservedQuantity
  const customerOrders = parseQuantity(res?.pendingCustomerOrderQuantity)
  const fcTransfers = parseQuantity(res?.pendingTransshipmentQuantity)
  const fcProcessing = parseQuantity(res?.fcProcessingQuantity)
  const explicitTotal = parseQuantity(res?.totalReservedQuantity)

  let total: number | null = explicitTotal
  if (total === null && (customerOrders !== null && fcTransfers !== null && fcProcessing !== null)) {
    total = (customerOrders ?? 0) + (fcTransfers ?? 0) + (fcProcessing ?? 0)
  }

  return { customerOrders, fcTransfers, fcProcessing, total }
}

function parseUnsellableBreakdown(details?: RawAmazonInventoryDetails | null): UnsellableBreakdown {
  const unful = details?.unfulfillableQuantity
  const customerDamaged = parseQuantity(unful?.customerDamagedQuantity)
  const warehouseDamaged = parseQuantity(unful?.warehouseDamagedQuantity)
  const distributorDamaged = parseQuantity(unful?.distributorDamagedQuantity)
  const carrierDamaged = parseQuantity(unful?.carrierDamagedQuantity)
  const defective = parseQuantity(unful?.defectiveQuantity)
  const expired = parseQuantity(unful?.expiredQuantity)
  const explicitTotal = parseQuantity(unful?.totalUnfulfillableQuantity)

  let total: number | null = explicitTotal
  if (
    total === null &&
    (customerDamaged !== null &&
      warehouseDamaged !== null &&
      distributorDamaged !== null &&
      carrierDamaged !== null &&
      defective !== null &&
      expired !== null)
  ) {
    total =
      (customerDamaged ?? 0) +
      (warehouseDamaged ?? 0) +
      (distributorDamaged ?? 0) +
      (carrierDamaged ?? 0) +
      (defective ?? 0) +
      (expired ?? 0)
  }

  return {
    customerDamaged,
    warehouseDamaged,
    distributorDamaged,
    carrierDamaged,
    defective,
    expired,
    total,
  }
}

export function parseFbaInventorySummary(
  summary: RawAmazonInventorySummary,
): ParsedFbaInventoryRecord | null {
  if (!summary || typeof summary !== 'object') return null

  const rawSku = summary.sellerSku || (summary as Record<string, unknown>)['sellerSKU']
  const sku = typeof rawSku === 'string' ? rawSku.trim() : null
  if (!sku) return null

  const details = summary.inventoryDetails
  const available = parseQuantity(details?.fulfillableQuantity)

  const inboundBreakdown = parseInboundBreakdown(details)
  const reservedBreakdown = parseReservedBreakdown(details)
  const unsellableBreakdown = parseUnsellableBreakdown(details)

  const quantities: StockQuantities = {
    available,
    reserved: reservedBreakdown.total,
    reservedBreakdown,
    inbound: inboundBreakdown.total,
    inboundBreakdown,
    unsellable: unsellableBreakdown.total,
    unsellableBreakdown,
    listed: null, // FBA listings do not use merchant listed quantity
    manualPhysical: null,
    rawQuantities: details ? (details as Readonly<Record<string, unknown>>) : null,
  }

  const asin = typeof summary.asin === 'string' ? summary.asin.trim() : null
  const fnSku = typeof summary.fnSku === 'string' ? summary.fnSku.trim() : null
  const title = typeof summary.productName === 'string' ? summary.productName.trim() : null
  const condition = typeof summary.condition === 'string' ? summary.condition.trim() : null
  const lastUpdatedTime =
    typeof summary.lastUpdatedTime === 'string' ? summary.lastUpdatedTime.trim() : null

  return {
    sku,
    asin,
    fnSku,
    title,
    condition,
    quantities,
    lastUpdatedTime,
    rawSummary: summary as Readonly<Record<string, unknown>>,
  }
}

/**
 * Parse an Amazon SP-API getInventorySummaries response envelope.
 *
 * Invariant:
 * - Robust against either standard SP-API payload envelope or direct summaries array.
 * - Unknown top-level fields are preserved in rawResponse.
 * - Missing or invalid items do not corrupt valid peers.
 * - nextToken is extracted for continuation.
 */
export function parseFbaInventoryPage(responseJson: unknown): ParsedFbaInventoryPage {
  const root = responseJson && typeof responseJson === 'object' ? (responseJson as Record<string, unknown>) : {}

  const payload = (root['payload'] && typeof root['payload'] === 'object' ? root['payload'] : root) as RawAmazonFbaInventoryResponse['payload']

  if (Array.isArray(root.errors) && root.errors.length) throw new Error('Amazon returned inventory errors; saved stock is retained.')
  if (!Array.isArray(payload?.inventorySummaries) && !Array.isArray(root.inventorySummaries)) throw new Error('Unrecognized inventory response; saved stock is retained.')
  const rawSummaries =
    Array.isArray(payload?.inventorySummaries)
      ? payload!.inventorySummaries
      : Array.isArray(root['inventorySummaries'])
        ? (root['inventorySummaries'] as RawAmazonInventorySummary[])
        : []

  const items: ParsedFbaInventoryRecord[] = []
  for (const raw of rawSummaries) {
    const parsed = parseFbaInventorySummary(raw)
    if (parsed) {
      items.push(parsed)
    }
  }

  const rawPagination = (root['pagination'] ?? payload?.['pagination']) as Record<string, unknown> | undefined
  const token =
    (typeof rawPagination?.['nextToken'] === 'string' && rawPagination['nextToken'].trim()) ||
    (typeof root['nextToken'] === 'string' && root['nextToken'].trim()) ||
    (typeof payload?.['nextToken'] === 'string' && (payload as Record<string, unknown>)['nextToken']) ||
    null

  const nextToken = typeof token === 'string' && token.length > 0 ? token : null

  return {
    items,
    nextToken,
    totalReportedCount: rawSummaries.length,
    isComplete: nextToken === null,
    rawResponse: root,
  }
}
