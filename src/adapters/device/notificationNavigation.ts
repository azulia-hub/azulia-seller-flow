/** Notification-tap navigation: destination types, validation, and reactive pending store.
 *
 * No credentials or buyer PII are stored here.
 * All fields are strictly validated before storage.
 */

export type NotificationDestination =
  | { kind: 'ORDER_DETAIL'; account: string; orderId: string; eventId: string }
  | { kind: 'REFUND_DETAIL'; account: string; orderId: string; transactionId: string; eventId: string }
  | { kind: 'INVENTORY_RESTOCK'; account: string; marketplace: string; sku: string; fulfillmentChannel: string; eventId: string }
  | { kind: 'REVIEW_RUN'; account: string; date: string; eventId: string }
  | { kind: 'SYNC_STATUS'; eventId: string }

const ACCOUNT_RE = /^[a-f0-9]{64}$/
const ORDER_ID_RE = /^[A-Z0-9]{3}-[0-9]{7}-[0-9]{7}$/
const DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/
const TRANSACTION_ID_RE = /^[a-zA-Z0-9_.:-]+$/
const IDENTIFIER_RE = /^[a-zA-Z0-9_.-]+$/

function str(raw: unknown, key: string): string | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = (raw as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 32 || code === 127) return true
  }
  return false
}

/** Strictly checks whether a date string is a real calendar date (YYYY-MM-DD). */
export function isValidCalendarDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false
  const [yearStr, monthStr, dayStr] = date.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)

  if (year < 2000 || year > 2100) return false
  if (month < 1 || month > 12) return false

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return day >= 1 && day <= daysInMonth
}

function generateEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/** Strictly validates each field and reconstructs a safe destination payload. Returns null for any invalid payload. */
export function parseNotificationDestination(raw: unknown): NotificationDestination | null {
  if (typeof raw !== 'object' || raw === null) return null
  const kind = str(raw, 'kind')
  const rawEventId = str(raw, 'eventId')
  const eventId = rawEventId && /^[a-zA-Z0-9_-]{1,64}$/.test(rawEventId) ? rawEventId : generateEventId()

  switch (kind) {
    case 'ORDER_DETAIL': {
      const account = str(raw, 'account')
      const orderId = str(raw, 'orderId')
      if (!account || !ACCOUNT_RE.test(account)) return null
      if (!orderId || !ORDER_ID_RE.test(orderId)) return null
      return { kind: 'ORDER_DETAIL', account, orderId, eventId }
    }
    case 'REFUND_DETAIL': {
      const account = str(raw, 'account')
      const orderId = str(raw, 'orderId')
      const transactionId = str(raw, 'transactionId')
      if (!account || !ACCOUNT_RE.test(account)) return null
      if (!orderId || !ORDER_ID_RE.test(orderId)) return null
      if (!transactionId || transactionId.length < 1 || transactionId.length > 128 || !TRANSACTION_ID_RE.test(transactionId)) return null
      return { kind: 'REFUND_DETAIL', account, orderId, transactionId, eventId }
    }
    case 'INVENTORY_RESTOCK': {
      const account = str(raw, 'account')
      const marketplace = str(raw, 'marketplace') ?? 'AMAZON'
      const sku = str(raw, 'sku')
      const fulfillmentChannel = str(raw, 'fulfillmentChannel') ?? 'LISTING'
      if (!account || !ACCOUNT_RE.test(account)) return null
      if (!marketplace || marketplace.length > 32 || !IDENTIFIER_RE.test(marketplace)) return null
      if (!sku || sku.trim().length < 1 || sku.length > 180 || hasControlCharacters(sku)) return null
      if (!fulfillmentChannel || fulfillmentChannel.length > 32 || !IDENTIFIER_RE.test(fulfillmentChannel)) return null
      return { kind: 'INVENTORY_RESTOCK', account, marketplace, sku, fulfillmentChannel, eventId }
    }
    case 'REVIEW_RUN': {
      const account = str(raw, 'account')
      const date = str(raw, 'date')
      if (!account || !ACCOUNT_RE.test(account)) return null
      if (!date || !isValidCalendarDate(date)) return null
      return { kind: 'REVIEW_RUN', account, date, eventId }
    }
    case 'SYNC_STATUS':
      return { kind: 'SYNC_STATUS', eventId }
    default:
      return null
  }
}

type DestinationListener = (destination: NotificationDestination | null) => void
const subscribers = new Set<DestinationListener>()
const handledEventIds = new Set<string>()
let activeDestination: NotificationDestination | null = null

/** Gets current pending destination without clearing it. */
export function getPendingDestination(): NotificationDestination | null {
  return activeDestination
}

/** Stores a destination and notifies all reactive subscribers. */
export function setPendingDestination(d: NotificationDestination | null): void {
  if (d && handledEventIds.has(d.eventId)) {
    return
  }
  activeDestination = d
  for (const listener of subscribers) {
    try {
      listener(activeDestination)
    } catch {
      /* Subscriber errors must not disrupt destination dispatch. */
    }
  }
}

/** Subscribes to pending destination changes. Immediately fires with current value. */
export function subscribeNotificationDestination(listener: DestinationListener): () => void {
  subscribers.add(listener)
  try {
    listener(activeDestination)
  } catch {}
  return () => {
    subscribers.delete(listener)
  }
}

/** Marks an event as handled, clearing it from the active store and notifying subscribers. */
export function markDestinationHandled(eventId: string): void {
  handledEventIds.add(eventId)
  if (handledEventIds.size > 200) {
    const oldest = handledEventIds.values().next().value
    if (oldest) handledEventIds.delete(oldest)
  }
  if (activeDestination && activeDestination.eventId === eventId) {
    activeDestination = null
    for (const listener of subscribers) {
      try {
        listener(null)
      } catch {}
    }
  }
}

/** Checks whether an event was already handled (preventing replays). */
export function isDestinationHandled(eventId: string): boolean {
  return handledEventIds.has(eventId)
}

/** Called from bridge with a raw response; sets pending destination if valid. */
export function receiveBridgeNavigation(raw: unknown): void {
  const dest = parseNotificationDestination(raw)
  if (dest) setPendingDestination(dest)
}
