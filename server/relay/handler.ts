import { createReviewTransport } from '../../src/adapters/amazon-reviews/transport'
import { createInventoryReader } from '../../src/adapters/amazon-inventory/reader'
import { requirePilotAccessToken, TokenExchangeError } from '../amazon/pilot'
import { createActivityReader, SourceError } from '../local/sync/reader'
import { createOrderDateReader } from '../local/sync/orders'
import { createCatalogReader } from '../local/sync/catalog'
import { object, text } from '../../src/adapters/amazon-report-sync/money'

const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'Netlify-CDN-Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' }
function json(value: unknown, status = 200) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  if (bytes.byteLength > 18 * 1024 * 1024) return new Response('{"error":"Amazon page exceeds the relay response limit; cached data was retained."}', { status: 413, headers })
  // Netlify's streaming response limit is larger than its buffered response limit.
  return new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close() } }), { status, headers })
}
function value(input: unknown, max = 8192) {
  if (typeof input !== 'string' || !input || input.length > max || /[\r\n\0]/.test(input)) throw new Error('Invalid request field.')
  return input
}
function dates(body: Record<string, unknown>) {
  const from = value(body.from, 40), to = value(body.to, 40), start = Date.parse(from), stop = Date.parse(to)
  if (!Number.isFinite(start) || !Number.isFinite(stop) || start >= stop || start < Date.UTC(2010, 0, 1) || stop - start > 31 * 86400000 || stop > Date.now() - 2 * 60000) throw new Error('Unsupported date window.')
  return { from: new Date(start).toISOString(), to: new Date(stop).toISOString() }
}
/** Stateless request scope only: no credentials, tokens or seller records stored or logged. */
export async function handleAmazonRelay(request: Request, upstream: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405)
  const origin = new URL(request.url).origin
  if (request.headers.get('origin') !== origin || request.headers.get('x-azulia-intent') !== 'amazon-relay' || request.headers.get('content-type') !== 'application/json') return json({ error: 'Request origin or intent is not allowed.' }, 403)
  try {
    const reader = request.body?.getReader(); if (!reader) return json({ error: 'Missing request.' }, 400)
    const chunks: Uint8Array[] = []; let size = 0
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 32768) return json({ error: 'Request is too large.' }, 413); chunks.push(part.value) } } finally { await reader.cancel() }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    const body = object(JSON.parse(new TextDecoder().decode(bytes))), action = text(body.action)
    if (action === 'connect') {
      const token = await requirePilotAccessToken({ AMAZON_SP_CLIENT_ID: value(body.clientId, 1024), AMAZON_SP_CLIENT_SECRET: value(body.clientSecret, 2048), AMAZON_SP_REFRESH_TOKEN: value(body.refreshToken) }, upstream)
      return json({ accessToken: token, expiresIn: 2700 })
    }
    if (!['finance', 'purchases', 'order', 'orderItems', 'catalog', 'inventory', 'reviewOrder', 'reviewEligibility', 'reviewSubmit'].includes(action)) return json({ error: 'Unsupported operation.' }, 400)
    const token = value(body.accessToken), credentials = {}, nextToken = body.nextToken === undefined || body.nextToken === null ? null : value(body.nextToken)
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(45000)])
    if(action==='reviewOrder')return json(await createReviewTransport(credentials,upstream,token).order(value(body.orderId,19),signal))
    if(action==='reviewEligibility')return json({eligible:await createReviewTransport(credentials,upstream,token).eligible(value(body.orderId,19),signal)})
    if(action==='reviewSubmit'){await createReviewTransport(credentials,upstream,token).submit(value(body.orderId,19),value(body.attemptId,64),signal);return json({accepted:true})}
    if (action === 'inventory') return json(await createInventoryReader(credentials,upstream,token)({source:body.source==='listings'?'listings':'fba',sellerId:text(body.sellerId),nextToken:text(body.nextToken)||null},signal))
    if (action === 'catalog') return json(await createCatalogReader(credentials, upstream, token)(value(body.asin, 10), signal))
    if (action === 'order') return json(await createOrderDateReader(credentials, upstream, token).one(value(body.orderId, 19), signal))
    if (action === 'orderItems') return json(await createOrderDateReader(credentials, upstream, token).items(value(body.orderId, 19), signal, nextToken))
    const range = action === 'finance' && body.orderId ? { from: new Date(0).toISOString(), to: new Date(0).toISOString() } : dates(body)
    const orderId = action === 'finance' && body.orderId ? value(body.orderId, 19) : null
    if (orderId && !/^[A-Z0-9]{3}-\d{7}-\d{7}$/.test(orderId)) return json({ error: 'Unsupported order reference.' }, 400)
    const job = { id: 0, kind: action, ...range, orderId, nextToken, createdAt: Date.now() }
    if (action === 'purchases') return json(await createOrderDateReader(credentials, upstream, token).page(job, signal))
    const page = await createActivityReader(credentials, upstream, token)(job, signal)
    return json({ records: page.records, nextToken: page.nextToken })
  } catch (cause) {
    if (cause instanceof SourceError || cause instanceof TokenExchangeError) return json({ error: cause.message.replace(/Open local connection settings to reconnect\./g, 'Reconnect through the website.').replace(/Check the local credentials\./g, 'Reconnect through the website.'), retryAfter: cause.retryAfter }, cause.status >= 400 && cause.status <= 599 ? cause.status : 502)
    return json({ error: 'The relay could not process this request. Cached data and checkpoints were retained.' }, 400)
  }
}
