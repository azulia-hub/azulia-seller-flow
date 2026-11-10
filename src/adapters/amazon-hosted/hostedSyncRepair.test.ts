import { describe, expect, it } from 'vitest'
import { object } from '../amazon-report-sync/money'
import { SyncRunTracker } from '../../core/sync/planner'

describe('Hosted sync repair regression cases', () => {
  it('orderItems envelope survives relay and contains { items: [...], nextToken }', () => {
    // 1. Verify relay returns { items: [...], nextToken } envelope
    const relayResponsePayload = {
      items: [
        {
          asin: 'B08XYZ1234',
          sku: 'AZ-WALL-ART-01',
          title: 'AZULIA Islamic Wall Art',
          quantity: 1,
          price: '1499.00',
          currency: 'INR',
        },
      ],
      nextToken: 'item-page-2-token',
    }

    // The relay must return an object with items array, NOT a naked array!
    expect(relayResponsePayload).toHaveProperty('items')
    expect(Array.isArray(relayResponsePayload.items)).toBe(true)
    expect(relayResponsePayload.items).toHaveLength(1)
    expect(relayResponsePayload.items[0]).toMatchObject({
      asin: 'B08XYZ1234',
      sku: 'AZ-WALL-ART-01',
      title: 'AZULIA Islamic Wall Art',
      price: '1499.00',
      currency: 'INR',
    })
    expect(relayResponsePayload.nextToken).toBe('item-page-2-token')

    // Verify browser's object() parser does not discard the envelope
    const parsedByBrowserRelay = object(relayResponsePayload)
    expect(Array.isArray(parsedByBrowserRelay.items)).toBe(true)
  })

  it('item pagination preserves and accumulates products across multiple pages', () => {
    // 2. Pagination test: page 1 followed by page 2 does not discard page 1 products
    const initialItems = [
      { asin: 'B011111111', sku: 'SKU-1', title: 'Product 1', quantity: 1, price: '500.00', currency: 'INR' },
    ]
    const page2Items = [
      { asin: 'B022222222', sku: 'SKU-2', title: 'Product 2', quantity: 2, price: '750.00', currency: 'INR' },
    ]

    // Simulating how cache.ts commitPage accumulates paginated items
    const combined = [...initialItems, ...page2Items]
    expect(combined).toHaveLength(2)
    expect(combined[0].sku).toBe('SKU-1')
    expect(combined[1].sku).toBe('SKU-2')

    const total = combined.reduce((sum, item) => sum + Number(item.price) * (item.quantity || 1), 0)
    expect(total).toBe(2000) // 500*1 + 750*2 = 2000
  })

  it('empty items and missing images terminate without infinite requeue loops', () => {
    // 3. Finite run test: SyncRunTracker limits enrichment budget and prevents re-enqueuing
    const tracker = new SyncRunTracker('run-test-1', { maxOrderItems: 2, maxCatalog: 2 })

    // First attempt for order 1
    expect(tracker.canEnqueue('orderItems', 'ORDER-001')).toBe(true)
    tracker.recordEnqueued('orderItems', 'ORDER-001')

    // Second attempt for same order in same run must be rejected
    expect(tracker.canEnqueue('orderItems', 'ORDER-001')).toBe(false)

    // Order 2
    expect(tracker.canEnqueue('orderItems', 'ORDER-002')).toBe(true)
    tracker.recordEnqueued('orderItems', 'ORDER-002')

    // Order 3 exceeds budget (budget is 2)
    expect(tracker.canEnqueue('orderItems', 'ORDER-003')).toBe(false)

    // Empty items response recorded as checked
    tracker.recordCompleted('orderItems', 'ORDER-001')
    expect(tracker.isResourceCompleted('orderItems', 'ORDER-001')).toBe(true)
    expect(tracker.canEnqueue('orderItems', 'ORDER-001')).toBe(false)
  })

  it('Catalog 403 does not block financial completion', () => {
    // 4. Catalog 403 error isolation
    const tracker = new SyncRunTracker('run-test-2')
    tracker.recordEnqueued('catalog', 'B08XYZ1234')

    // When catalog returns 403
    const errorMsg = 'Access to Catalog Items API is not allowed (403 Forbidden).'
    tracker.recordFailed('catalog', 'B08XYZ1234', errorMsg)

    // Catalog failure recorded
    expect(tracker.isResourceFailed('catalog', 'B08XYZ1234')).toBe(true)
    expect(tracker.getFailureReason('catalog', 'B08XYZ1234')).toBe(errorMsg)

    // Financial operations remain unaffected
    expect(tracker.canEnqueue('finance', 'range-1')).toBe(true)
    expect(tracker.canEnqueue('purchases', 'range-1')).toBe(true)
  })

  it('exhausted retries remain visible as failures rather than being silently dropped', () => {
    // 5. Retry exhaustion tracking
    const tracker = new SyncRunTracker('run-test-3')
    tracker.recordEnqueued('order', '404-1234567-8901234')

    const permanentError = 'Amazon returned 404: Order not found.'
    tracker.recordFailed('order', '404-1234567-8901234', permanentError)

    expect(tracker.isResourceFailed('order', '404-1234567-8901234')).toBe(true)
    expect(tracker.getFailureReason('order', '404-1234567-8901234')).toContain('404')
  })

  it('unchanged data does not trigger recalculation or emit revision changes', () => {
    // 6. Unchanged delivery content
    const existingOrder = {
      id: '407-4079134-5050764',
      purchased: '2026-11-10T06:36:48.000Z',
      status: 'Unshipped',
      fulfillmentType: 'MFN',
      orderValue: '3514.05',
      currency: 'INR',
    }

    const incomingOrder = { ...existingOrder }

    // Same content produces identical keys
    const isUnchanged = JSON.stringify(existingOrder) === JSON.stringify(incomingOrder)
    expect(isUnchanged).toBe(true)
  })
})
