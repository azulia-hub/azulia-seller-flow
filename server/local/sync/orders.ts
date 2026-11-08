import { type PilotCredentials } from '../../amazon/pilot.ts'
import type { SourceOrderSummary } from '../../../src/adapters/amazon-report-sync/protocol.ts'
import { object, text } from '../../../src/adapters/amazon-report-sync/money.ts'
import { SourceError, sourceAccessToken } from './reader.ts'
import type { Job } from './store.ts'
export interface OrderDateIssue { orderId: string; raw: string; reason: string }
export function parseOrderDate(row: Record<string, unknown>) {
  const id = text(row.AmazonOrderId), purchased = text(row.PurchaseDate)
  if (!/^[A-Z0-9]{3}-\d{7}-\d{7}$/.test(id)) throw new SourceError('Amazon returned an unsupported order identifier; the source reference is retained for review.', 300, 422)
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(purchased) || !Number.isFinite(Date.parse(purchased))) throw new SourceError('Amazon returned an unsupported order purchase date; the posting date was not substituted.', 300, 422)
  if (row.MarketplaceId !== undefined && row.MarketplaceId !== 'A21TJRUUN4KGV') throw new SourceError('Order marketplace differs from the configured India account.')
  const total = object(row.OrderTotal), amount = text(total.Amount)
  const summary: SourceOrderSummary = { id, purchased, status: text(row.OrderStatus) || null, fulfillmentType: text(row.FulfillmentChannel) || null,
    orderValue: amount || null, currency: text(total.CurrencyCode) || null }
  return { id, purchased, ...(row.OrderStatus !== undefined || row.OrderTotal !== undefined || row.FulfillmentChannel !== undefined ? { summary } : {}) }
}
export function createOrderDateReader(credentials: PilotCredentials, request: typeof fetch = fetch, sessionToken?: string) {
  let token: string | null = sessionToken ?? null, until = sessionToken ? Infinity : 0
  async function read(path: string, query: URLSearchParams, signal: AbortSignal) {
    if (!token || Date.now() >= until) { token = await sourceAccessToken(credentials, request); until = Date.now() + 45 * 60000 }
    if (!token) throw new SourceError('Amazon authorization failed while reading purchase dates.', 900, 401)
    const url = new URL(path, 'https://sellingpartnerapi-eu.amazon.com'); url.search = query.toString()
    const response = await request(url, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]), headers: { 'x-amz-access-token': token, 'User-Agent': 'Azulia/0.1' } })
    if (!response.ok) {
      await response.body?.cancel()
      if (response.status === 401) { token = null; until = 0 }
      const delay = Number(response.headers.get('retry-after'))
      throw new SourceError(response.status === 403 ? 'Amazon denied order access. Enable Inventory and Order Tracking to verify purchase dates. Financial records remain saved.' : 'Amazon purchase dates are unavailable; affected orders remain outside period totals until verified.', Number.isFinite(delay) && delay > 0 ? Math.max(delay, 3) : response.status === 429 ? 60 : 300, response.status)
    }
    const reader = response.body?.getReader()
    if (!reader) throw new SourceError('Amazon returned no order data.')
    const chunks: Uint8Array[] = []; let size = 0
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 20 * 1024 * 1024) throw new SourceError('Amazon order page exceeds the local limit.'); chunks.push(part.value) } } finally { await reader.cancel() }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    return object(object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))).payload)
  }

  return {
    async one(id: string, signal: AbortSignal) {
      if (!/^[A-Z0-9]{3}-\d{7}-\d{7}$/.test(id)) throw new SourceError('Unsupported Amazon order ID.', 21600, 400)
      const order = parseOrderDate(await read(`/orders/v0/orders/${encodeURIComponent(id)}`, new URLSearchParams(), signal))
      if (order.id !== id) throw new SourceError('Amazon returned a different order identity; its date was not applied.', 300, 422)
      return order
    },
    async page(job: Job, signal: AbortSignal) {
      const payload = await read('/orders/v0/orders', new URLSearchParams({ MarketplaceIds: 'A21TJRUUN4KGV', CreatedAfter: job.from, CreatedBefore: job.to, MaxResultsPerPage: '100', ...(job.nextToken ? { NextToken: job.nextToken } : {}) }), signal)
      if (!Array.isArray(payload.Orders)) throw new SourceError('Amazon returned an unsupported order page; coverage was not advanced.')
      const nextToken = text(payload.NextToken) || null
      if (nextToken && (nextToken.length > 8192 || nextToken === job.nextToken)) throw new SourceError('Unsupported order continuation token.')
      const orders: ReturnType<typeof parseOrderDate>[] = [], issues: OrderDateIssue[] = []
      for (const value of payload.Orders) {
        const row = object(value)
        try { orders.push(parseOrderDate(row)) } catch (cause) {
          // One unsupported order must not trap pagination and hide every older order.
          // Retain only date/identity evidence, never buyer or address information.
          const raw = JSON.stringify(Object.fromEntries(['AmazonOrderId','PurchaseDate','MarketplaceId','OrderStatus','SalesChannel'].filter(key => key in row).map(key => [key, row[key]])))
          issues.push({ orderId: text(row.AmazonOrderId), raw, reason: cause instanceof Error ? cause.message : 'Unsupported order metadata.' })
        }
      }
      return { orders, issues, nextToken }
    },
  }
}
