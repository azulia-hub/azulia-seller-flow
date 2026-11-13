import { requirePilotAccessToken, TokenExchangeError, type PilotCredentials } from './authorization.ts'
import { parseSourceJson, object, text } from '../amazon-report-sync/money.ts'
import type { SourceReadJob as Job } from './types.ts'
export class SourceError extends Error {
  readonly retryAfter: number
  readonly status: number
  constructor(message: string, retryAfter = 60, status = 0) { super(message); this.retryAfter = retryAfter; this.status = status }
}
export async function sourceAccessToken(credentials: PilotCredentials, request: typeof fetch) {
  try { return await requirePilotAccessToken(credentials, request) } catch (cause) {
    if (cause instanceof TokenExchangeError) throw new SourceError(cause.message, cause.retryAfter, cause.status)
    throw new SourceError('Amazon authorization could not be refreshed. Saved results remain available.', 60)
  }
}
export function createActivityReader(credentials: PilotCredentials, request: typeof fetch = fetch, sessionToken?: string) {
  let token: string | null = sessionToken ?? null, until = sessionToken ? Infinity : 0
  return async (job: Job, signal: AbortSignal) => {
    if (!token || Date.now() >= until) { token = await sourceAccessToken(credentials, request); until = Date.now() + 45 * 60000 }
    if (!token) throw new SourceError('Amazon authorization failed. Check the local credentials.', 900, 401)
    const url = new URL('https://sellingpartnerapi-eu.amazon.com/finances/2024-06-19/transactions')
    url.search = new URLSearchParams({ marketplaceId: 'A21TJRUUN4KGV', ...(job.orderId ? { relatedIdentifierName: 'ORDER_ID', relatedIdentifierValue: job.orderId } : { postedAfter: job.from, postedBefore: job.to }), ...(job.nextToken ? { nextToken: job.nextToken } : {}) }).toString()
    const response = await request(url, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]), headers: { 'x-amz-access-token': token, 'User-Agent': 'Azulia/0.1' } })
    if (!response.ok) {
      await response.body?.cancel()
      if (response.status === 401) { token = null; until = 0 }
      const seconds = Number(response.headers.get('retry-after'))
      throw new SourceError(response.status === 403 ? 'Amazon denied Finance and Accounting access. Check the application roles and seller authorization.' : response.status === 429 ? 'Waiting for Amazon request allowance.' : 'Amazon activity could not be fetched. Saved data remains available.', Number.isFinite(seconds) && seconds > 0 ? Math.max(seconds, 3) : response.status === 429 ? 60 : 300, response.status)
    }
    const reader = response.body?.getReader()
    if (!reader) throw new SourceError('Amazon returned an empty response body.')
    const chunks: Uint8Array[] = []; let size = 0
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 20 * 1024 * 1024) throw new SourceError('Amazon response exceeds the local page limit.'); chunks.push(part.value) } } finally { await reader.cancel() }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes), payload = object(object(parseSourceJson(raw)).payload)
    if (!Array.isArray(payload.transactions) || payload.transactions.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new SourceError('Amazon returned an unsupported transaction schema; the checkpoint was not advanced.')
    if (payload.nextToken !== undefined && payload.nextToken !== null && (typeof payload.nextToken !== 'string' || payload.nextToken.length > 8192)) throw new SourceError('Unsupported source continuation token.')
    const nextToken = text(payload.nextToken) || null
    if (nextToken && nextToken === job.nextToken) throw new SourceError('Amazon repeated a continuation token; pagination was stopped.')
    return { records: payload.transactions as Record<string, unknown>[], nextToken, raw }
  }
}
