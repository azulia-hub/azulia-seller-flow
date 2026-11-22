import type { ReturnInspectionRecord } from './types'

/** Match order and SKU first; retain the legacy order-key fallback. Input is account-scoped by the caller. */
export function findReturnInspection(
  inspections: ReadonlyMap<string, ReturnInspectionRecord> | Record<string, ReturnInspectionRecord>,
  orderId: string,
  sku: string
): ReturnInspectionRecord | undefined {
  if (inspections instanceof Map) {
    for (const record of inspections.values()) {
      if (record.identity.orderId === orderId && record.identity.sku === sku) return record
    }
    return inspections.get(orderId)
  }
  for (const record of Object.values(inspections)) {
    if (record?.identity?.orderId === orderId && record?.identity?.sku === sku) return record
  }
  return (inspections as Record<string, ReturnInspectionRecord>)[orderId]
}
