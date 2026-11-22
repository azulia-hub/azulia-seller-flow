import { describe, expect, it } from 'vitest'
import { findReturnInspection } from './findInspection'
import { createDefaultInspection } from './recoveryModel'

describe.each(['map', 'record'] as const)('shared inspection lookup (%s)', storage => {
  const record = (orderId: string, sku: string) => createDefaultInspection({ sellerAccount: 'seller', marketplace: 'market', orderId, sku }, 1, '2026-11-22T00:00:00Z')
  const matching = record('order', 'child-b'), sibling = record('order', 'child-a'), otherOrder = record('other', 'child-b')
  const entries = { order: sibling, composite: matching, other: otherOrder }
  const inspections = storage === 'map' ? new Map(Object.entries(entries)) : entries

  it('prefers the exact order/SKU pair over a legacy order-only record', () => {
    expect(findReturnInspection(inspections, 'order', 'child-b')).toBe(matching)
  })
  it('retains the existing order-key fallback and does not use a different order', () => {
    expect(findReturnInspection(inspections, 'order', 'missing-sku')).toBe(sibling)
    expect(findReturnInspection(inspections, 'missing-order', 'child-b')).toBeUndefined()
  })
})
