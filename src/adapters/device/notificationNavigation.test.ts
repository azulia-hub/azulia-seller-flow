import { describe, it, expect, beforeEach } from 'vitest'
import {
  parseNotificationDestination,
  isValidCalendarDate,
  getPendingDestination,
  setPendingDestination,
  subscribeNotificationDestination,
  markDestinationHandled,
  isDestinationHandled,
  receiveBridgeNavigation,
  type NotificationDestination,
} from './notificationNavigation'

describe('parseNotificationDestination & calendar validation', () => {
  const validAccount = 'a'.repeat(64)
  const validOrderId = '123-1234567-1234567'

  it('validates calendar dates strictly', () => {
    expect(isValidCalendarDate('2026-11-17')).toBe(true)
    expect(isValidCalendarDate('2024-02-29')).toBe(true) // 2024 is leap year
    expect(isValidCalendarDate('2026-02-29')).toBe(false) // 2026 is not leap year
    expect(isValidCalendarDate('2026-02-30')).toBe(false)
    expect(isValidCalendarDate('2026-13-01')).toBe(false)
    expect(isValidCalendarDate('1999-12-31')).toBe(false)
    expect(isValidCalendarDate('not-a-date')).toBe(false)
  })

  it('accepts valid ORDER_DETAIL with eventId', () => {
    const result = parseNotificationDestination({ kind: 'ORDER_DETAIL', account: validAccount, orderId: validOrderId, eventId: 'evt-1' })
    expect(result).toEqual({ kind: 'ORDER_DETAIL', account: validAccount, orderId: validOrderId, eventId: 'evt-1' })
  })

  it('generates eventId when missing from ORDER_DETAIL', () => {
    const result = parseNotificationDestination({ kind: 'ORDER_DETAIL', account: validAccount, orderId: validOrderId })
    expect(result?.kind).toBe('ORDER_DETAIL')
    expect(result?.eventId).toBeDefined()
    expect(typeof result?.eventId).toBe('string')
  })

  it('rejects invalid orderId in ORDER_DETAIL', () => {
    expect(parseNotificationDestination({ kind: 'ORDER_DETAIL', account: validAccount, orderId: 'bad-order' })).toBeNull()
    expect(parseNotificationDestination({ kind: 'ORDER_DETAIL', account: validAccount, orderId: '' })).toBeNull()
  })

  it('rejects invalid account in ORDER_DETAIL', () => {
    expect(parseNotificationDestination({ kind: 'ORDER_DETAIL', account: 'short', orderId: validOrderId })).toBeNull()
    expect(parseNotificationDestination({ kind: 'ORDER_DETAIL', account: 'z'.repeat(64), orderId: validOrderId })).toBeNull()
  })

  it('accepts valid REFUND_DETAIL with transactionId', () => {
    const result = parseNotificationDestination({
      kind: 'REFUND_DETAIL',
      account: validAccount,
      orderId: validOrderId,
      transactionId: 'TXN-998877',
      eventId: 'evt-ref-1',
    })
    expect(result).toEqual({
      kind: 'REFUND_DETAIL',
      account: validAccount,
      orderId: validOrderId,
      transactionId: 'TXN-998877',
      eventId: 'evt-ref-1',
    })
  })

  it('rejects REFUND_DETAIL with empty or oversized transactionId', () => {
    expect(parseNotificationDestination({ kind: 'REFUND_DETAIL', account: validAccount, orderId: validOrderId, transactionId: '' })).toBeNull()
    expect(parseNotificationDestination({ kind: 'REFUND_DETAIL', account: validAccount, orderId: validOrderId, transactionId: 'x'.repeat(129) })).toBeNull()
  })

  it('accepts valid INVENTORY_RESTOCK retaining marketplace, sku and fulfillmentChannel', () => {
    const result = parseNotificationDestination({
      kind: 'INVENTORY_RESTOCK',
      account: validAccount,
      marketplace: 'AMAZON',
      sku: 'SKU-ABC-123',
      fulfillmentChannel: 'FBA',
      eventId: 'evt-inv-1',
    })
    expect(result).toEqual({
      kind: 'INVENTORY_RESTOCK',
      account: validAccount,
      marketplace: 'AMAZON',
      sku: 'SKU-ABC-123',
      fulfillmentChannel: 'FBA',
      eventId: 'evt-inv-1',
    })
  })

  it('rejects INVENTORY_RESTOCK with control characters or invalid bounds', () => {
    expect(parseNotificationDestination({ kind: 'INVENTORY_RESTOCK', account: validAccount, marketplace: 'AMAZON', sku: '', fulfillmentChannel: 'FBA' })).toBeNull()
    expect(parseNotificationDestination({ kind: 'INVENTORY_RESTOCK', account: validAccount, marketplace: 'AMAZON', sku: 's'.repeat(181), fulfillmentChannel: 'FBA' })).toBeNull()
    expect(parseNotificationDestination({ kind: 'INVENTORY_RESTOCK', account: validAccount, marketplace: 'AMAZON', sku: 'sku\nattack', fulfillmentChannel: 'FBA' })).toBeNull()
    expect(parseNotificationDestination({ kind: 'INVENTORY_RESTOCK', account: validAccount, marketplace: 'm'.repeat(33), sku: 'SKU', fulfillmentChannel: 'FBA' })).toBeNull()
  })

  it('accepts valid REVIEW_RUN with real calendar date', () => {
    const result = parseNotificationDestination({ kind: 'REVIEW_RUN', account: validAccount, date: '2026-11-16', eventId: 'evt-rev-1' })
    expect(result).toEqual({ kind: 'REVIEW_RUN', account: validAccount, date: '2026-11-16', eventId: 'evt-rev-1' })
  })

  it('rejects REVIEW_RUN with impossible calendar date', () => {
    expect(parseNotificationDestination({ kind: 'REVIEW_RUN', account: validAccount, date: '2026-02-30' })).toBeNull()
    expect(parseNotificationDestination({ kind: 'REVIEW_RUN', account: validAccount, date: 'yesterday' })).toBeNull()
  })

  it('accepts SYNC_STATUS without account', () => {
    const res = parseNotificationDestination({ kind: 'SYNC_STATUS', eventId: 'evt-sync' })
    expect(res).toEqual({ kind: 'SYNC_STATUS', eventId: 'evt-sync' })
  })

  it('strips extra/unexpected fields such as credentials, tokens or buyer PII', () => {
    const dirty = {
      kind: 'ORDER_DETAIL',
      account: validAccount,
      orderId: validOrderId,
      eventId: 'evt-safe',
      buyerName: 'John Doe',
      buyerEmail: 'john@example.com',
      authToken: 'secret-token-123',
    }
    const result = parseNotificationDestination(dirty)
    expect(result).toEqual({ kind: 'ORDER_DETAIL', account: validAccount, orderId: validOrderId, eventId: 'evt-safe' })
    expect((result as Record<string, unknown>).buyerName).toBeUndefined()
    expect((result as Record<string, unknown>).buyerEmail).toBeUndefined()
    expect((result as Record<string, unknown>).authToken).toBeUndefined()
  })
})

describe('reactive pending destination store & duplicate prevention', () => {
  beforeEach(() => {
    setPendingDestination(null)
  })

  it('notifies subscribers immediately and on subsequent updates', () => {
    const received: (NotificationDestination | null)[] = []
    const unsub = subscribeNotificationDestination(dest => received.push(dest))

    expect(received).toEqual([null])

    const dest: NotificationDestination = { kind: 'SYNC_STATUS', eventId: 'evt-test-1' }
    setPendingDestination(dest)

    expect(received).toEqual([null, dest])
    expect(getPendingDestination()).toEqual(dest)

    unsub()
  })

  it('retains pending destination across simulated delayed data readiness', () => {
    const dest: NotificationDestination = {
      kind: 'ORDER_DETAIL',
      account: 'b'.repeat(64),
      orderId: '404-1234567-7654321',
      eventId: 'evt-order-delayed',
    }
    setPendingDestination(dest)

    // Data not ready yet: destination is still retained
    let isAppReady = false
    expect(isAppReady ? getPendingDestination() : null).toBeNull()
    expect(getPendingDestination()).toEqual(dest)

    // App becomes ready: destination is retrieved and handled
    isAppReady = true
    const current = isAppReady ? getPendingDestination() : null
    expect(current).toEqual(dest)

    // Destination is acknowledged
    markDestinationHandled(dest.eventId)
    expect(getPendingDestination()).toBeNull()
    expect(isDestinationHandled(dest.eventId)).toBe(true)
  })

  it('prevents replay of already handled event IDs', () => {
    const dest: NotificationDestination = { kind: 'SYNC_STATUS', eventId: 'evt-once-only' }
    setPendingDestination(dest)
    markDestinationHandled(dest.eventId)
    expect(getPendingDestination()).toBeNull()

    // Subsequent arrival of the same tap event is ignored
    setPendingDestination(dest)
    expect(getPendingDestination()).toBeNull()
  })

  it('receiveBridgeNavigation validates and updates pending destination', () => {
    receiveBridgeNavigation({
      kind: 'ORDER_DETAIL',
      account: 'c'.repeat(64),
      orderId: '111-2222222-3333333',
      eventId: 'evt-bridge-1',
    })
    expect(getPendingDestination()?.kind).toBe('ORDER_DETAIL')
  })

  it('receiveBridgeNavigation ignores invalid raw payloads without corrupting state', () => {
    receiveBridgeNavigation({ invalid: true })
    expect(getPendingDestination()).toBeNull()
  })
})
