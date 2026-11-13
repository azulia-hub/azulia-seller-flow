import { createInventoryReader } from '../amazon-inventory/reader'
import { nativeRequest } from './bridge'
import { createActivityReader } from '../amazon-api/reader'
import { createOrderDateReader } from '../amazon-api/orders'
import { createCatalogReader } from '../amazon-api/catalog'
import { text } from '../amazon-report-sync/money'

/** Native HTTPS injects authorization. No Amazon access token crosses this bridge. */
const nativeFetch: typeof fetch = async (input, init) => {
  if (init?.signal?.aborted) throw new DOMException('Stopped', 'AbortError')
  const url = input instanceof Request ? input.url : String(input)
  const result = await nativeRequest<{ status: number; body: string; retryAfter: string | null }>('amazon.request', { url })
  if (init?.signal?.aborted) throw new DOMException('Stopped', 'AbortError')
  return new Response(result.body, { status: result.status, headers: { 'Content-Type': 'application/json', ...(result.retryAfter ? { 'Retry-After': result.retryAfter } : {}) } })
}
const activity = createActivityReader({}, nativeFetch, 'native-managed')
const orders = createOrderDateReader({}, nativeFetch, 'native-managed')
const catalog = createCatalogReader({}, nativeFetch, 'native-managed')
export async function androidAmazon(body: Record<string, unknown>, signal: AbortSignal): Promise<Record<string, unknown>> {
  if (signal.aborted) throw new DOMException('Stopped', 'AbortError')
  const request: typeof fetch = body.backgroundId ? async input => {
    const saved = await nativeRequest<{ status: number; body: string }>('background.read', { account: body.account, id: body.backgroundId, url: String(input) })
    return new Response(saved.body, { status: saved.status, headers: { 'Content-Type': 'application/json' } })
  } : nativeFetch
  const financeReader = body.backgroundId ? createActivityReader({}, request, 'native-managed') : activity
  const orderReader = body.backgroundId ? createOrderDateReader({}, request, 'native-managed') : orders
  switch (body.action) {
    case 'connect': {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ clientId: body.clientId, refreshToken: body.refreshToken })))
      const account = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
      await nativeRequest('session.connect', { account, clientId: body.clientId, clientSecret: body.clientSecret, refreshToken: body.refreshToken })
      return { accessToken: 'native-managed' }
    }
    case 'inventory': return createInventoryReader({},nativeFetch,'native-managed')({source:body.source==='listings'?'listings':'fba',sellerId:text(body.sellerId),nextToken:text(body.nextToken)||null},signal)
    case 'order': return orders.one(text(body.orderId), signal)
    case 'orderItems': return orders.items(text(body.orderId), signal, text(body.nextToken) || null)
    case 'catalog': return catalog(text(body.asin), signal)
    case 'purchases': return orderReader.page({ updatedOnly: body.updatedOnly === true, from: text(body.from), to: text(body.to), nextToken: text(body.nextToken) || null }, signal)
    case 'finance': {
      const result = await financeReader({ from: text(body.from), to: text(body.to), orderId: text(body.orderId) || null, nextToken: text(body.nextToken) || null }, signal)
      return { records: result.records, nextToken: result.nextToken }
    }
    default: throw new Error('Unsupported native Amazon operation.')
  }
}
