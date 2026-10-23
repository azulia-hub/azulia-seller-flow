import type { CanonicalFinancialEvent } from '../data/types'

/** Operating account entries already included in the selected financial result. */
export function listAccountCharges(events: readonly CanonicalFinancialEvent[]) {
  const identifiableOrders = new Set(events.filter(event => event.sku && event.orderId).map(event => event.orderId))
  return events.filter(event => event.amountClass === 'OPERATING' && !event.sku && (!event.orderId || !identifiableOrders.has(event.orderId)) && event.amountType !== 'ADVERTISING_FEE')
    .map(event => ({ label: event.rawDescription || event.rawType || event.amountType, amount: event.amount, classified: event.classified }))
}
