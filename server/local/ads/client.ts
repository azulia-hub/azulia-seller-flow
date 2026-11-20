import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { entityRequest, parseEntityPage, type AdsEntityKind } from '../../../src/adapters/amazon-ads/entities.ts'
import type { AdsCredentials } from './credentials.ts'
import { parseAdsRows, type AdsRange } from '../../../src/adapters/amazon-ads/report.ts'
import { parseSupplementalRows, reportSpecification, type AdsReportKind, type AdsSupplementalKind } from '../../../src/adapters/amazon-ads/supplemental.ts'

const endpoint = 'https://advertising-api-eu.amazon.com'
export class AdsError extends Error {
  readonly retrySeconds: number
  readonly status: number
  constructor(message: string, retrySeconds = 60, status = 0) { super(message); this.retrySeconds = retrySeconds; this.status = status }
}
export async function boundedAdsBytes(response: Response, maximum: number): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length')) > maximum) { await response.body?.cancel(); throw new AdsError('Amazon Ads response is too large. Previous results retained.', 3600) }
  const reader = response.body?.getReader()
  if (!reader) throw new AdsError('Amazon Ads returned an empty response.')
  const chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break
      size += value.byteLength
      if (size > maximum) throw new AdsError('Amazon Ads response is too large. Previous results retained.', 3600)
      chunks.push(value)
    }
  } finally { await reader.cancel() }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}
export function safeAdsDownloadUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 16000) throw new AdsError('Amazon Ads report has no supported download URL.')
  const url = new URL(value)
  // Signed report downloads receive no Authorization, profile or client headers.
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash
    || !/^[a-z0-9.-]+\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(url.hostname)) throw new AdsError('Amazon Ads report download host is unsupported. Previous results retained.', 3600)
  return url.href
}
export function createAdsClient(credentials: AdsCredentials, request: typeof fetch = fetch, clock = Date.now) {
  let access = credentials.accessToken ?? '', expiresAt = credentials.expiresAt ?? 0
  let renewal: Promise<string> | null = null, verification: Promise<{ name: string; profileId: string; sellerId: string }> | null = null, verifiedUntil = 0
  let creationQueue: Promise<void> = Promise.resolve(), nextCreateAt = 0
  async function token(): Promise<string> {
    if (access && clock() < expiresAt - 60000) return access
    if (renewal) return renewal
    renewal = renew().finally(() => { renewal = null })
    return renewal
  }
  async function renew(): Promise<string> {
    if (!credentials.clientSecret) throw new AdsError('Add your Amazon Ads client secret with npm run ads:setup to enable automatic token renewal.', 60, 401)
    const response = await request('https://api.amazon.co.uk/auth/o2/token', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: credentials.clientId, client_secret: credentials.clientSecret, refresh_token: credentials.refreshToken }) })
    if (!response.ok) { await response.body?.cancel(); throw new AdsError([400, 401, 403].includes(response.status) ? 'Amazon Ads authorization was rejected. Reconnect the Ads profile; seller API credentials are separate.' : 'Amazon Ads token service is temporarily unavailable.', response.status === 429 ? 120 : 300, response.status) }
    const body = JSON.parse(new TextDecoder().decode(await boundedAdsBytes(response, 32768)))
    if (typeof body.access_token !== 'string' || !body.access_token || typeof body.expires_in !== 'number' || !Number.isFinite(body.expires_in) || body.expires_in < 60) throw new AdsError('Amazon Ads returned an invalid token response.', 300)
    access = body.access_token; expiresAt = clock() + body.expires_in * 1000
    return access
  }
  async function api(path: string, body?: unknown, media = 'application/vnd.createasyncreportrequest.v3+json'): Promise<Record<string, unknown> | unknown[]> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await request(endpoint + path, { method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(25000),
        headers: { Authorization: `Bearer ${await token()}`, 'Amazon-Advertising-API-ClientId': credentials.clientId, 'Amazon-Advertising-API-Scope': credentials.profileId,
          ...(body === undefined ? {} : { 'Content-Type': media, Accept: media }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      if (response.status === 401 && attempt === 0) { await response.body?.cancel(); expiresAt = 0; continue }
      const raw = new TextDecoder().decode(await boundedAdsBytes(response, 2 * 1024 * 1024))
      if (!response.ok) {
        // Reuse Amazon's duplicate async job; no second logical observation is added.
        if (response.status === 425 && body !== undefined) {
          const duplicate = raw.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i)?.[0]
          if (duplicate) return { reportId: duplicate }
        }
        const retry = Number(response.headers.get('retry-after'))
        throw new AdsError(response.status === 429 ? 'Amazon Ads rate limit reached. Saved results remain available.' : `Amazon Ads request failed (HTTP ${response.status}). Check Ads reporting access. Previous results retained.`, Number.isFinite(retry) && retry > 0 ? Math.max(30, Math.min(3600, retry)) : 300, response.status)
      }
      return JSON.parse(raw)
    }
    throw new AdsError('Amazon Ads requires renewed authorization.', 300, 401)
  }
  return {
    async entities(kind: AdsEntityKind, nextToken?: string | null) {
      const spec = entityRequest(kind, nextToken)
      return parseEntityPage(kind, await api(spec.path, spec.body, spec.media), credentials.profileId, new Date(clock()).toISOString())
    },
    async verify() {
      if (!verification || clock() >= verifiedUntil) {
        verifiedUntil = clock() + 5 * 60000
        verification = (async () => {
          const profiles = await api('/v2/profiles')
          if (!Array.isArray(profiles)) throw new AdsError('Amazon Ads returned an invalid profiles response.', 300)
          const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
          const profile = record(profiles.find(item => String(record(item).profileId) === credentials.profileId))
          const account = record(profile.accountInfo)
          if (profile.countryCode !== 'IN' || profile.currencyCode !== 'INR' || account.type !== 'seller' || account.id !== credentials.sellerId) throw new AdsError('The selected India Ads seller profile does not match this connection. Saved reports were not replaced.', 3600, 403)
          return { name: String(account.name ?? credentials.accountName), profileId: credentials.profileId, sellerId: credentials.sellerId }
        })().catch(cause => { verification = null; throw cause })
      }
      return verification
    },
    async create(range: AdsRange, kind: AdsReportKind = 'advertisedProduct'): Promise<string> {
      const previous = creationQueue
      let release!: () => void
      creationQueue = new Promise(resolve => { release = resolve })
      await previous
      try {
        const delay = Math.max(0, nextCreateAt - clock())
        if (delay) await new Promise(resolve => setTimeout(resolve, delay))
        nextCreateAt = clock() + 1000
        const data = await api('/reporting/reports', reportSpecification(range, kind)) as Record<string, unknown>
        if (typeof data.reportId !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(data.reportId)) throw new AdsError('Amazon Ads returned no valid report job ID.')
        return data.reportId
      } finally { release() }
    },
    async poll(id: string): Promise<{ status: string; url?: unknown }> {
      if (!/^[a-zA-Z0-9-]{1,128}$/.test(id)) throw new AdsError('Invalid saved Ads job ID.', 3600)
      const data = await api(`/reporting/reports/${id}`) as Record<string, unknown>
      if (!['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'].includes(String(data.status))) throw new AdsError('Amazon Ads returned an unknown report state.')
      return { status: String(data.status), url: data.url }
    },
    async download(value: unknown, range: AdsRange) {
      const response = await request(safeAdsDownloadUrl(value), { redirect: 'error', signal: AbortSignal.timeout(45000) })
      if (!response.ok) { await response.body?.cancel(); throw new AdsError('Amazon Ads report download failed. The job will be checked again.') }
      const bytes = await boundedAdsBytes(response, 16 * 1024 * 1024)
      const decoded = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 }) : bytes
      return parseAdsRows(JSON.parse(new TextDecoder().decode(decoded)), range)
    },
    async downloadSupplemental(value: unknown, range: AdsRange, kind: AdsSupplementalKind) {
      const response = await request(safeAdsDownloadUrl(value), { redirect: 'error', signal: AbortSignal.timeout(45000) })
      if (!response.ok) { await response.body?.cancel(); throw new AdsError('Amazon Ads report download failed. The job will be checked again.') }
      const bytes = await boundedAdsBytes(response, 16 * 1024 * 1024)
      const decoded = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 }) : bytes
      return parseSupplementalRows(JSON.parse(new TextDecoder().decode(decoded)), range, kind)
    },
  }
}

/** Report kinds share renewal and create pacing without exposing credentials. */
export function sharedAdsClientFactory(): typeof createAdsClient {
  let fingerprint = '', client: ReturnType<typeof createAdsClient> | null = null
  return (credentials, request, clock) => {
    const next = createHash('sha256').update(JSON.stringify(credentials)).digest('hex')
    if (!client || next !== fingerprint) { client = createAdsClient(credentials, request, clock); fingerprint = next }
    return client
  }
}
