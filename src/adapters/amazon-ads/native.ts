import { nativeRequest } from '../device/bridge'
import { parseAdsRows, validAdsDate } from './report'
import type { SponsoredProductsReport } from '../../core/advertising/types'
import { entityKind, parseEntityPage } from './entities'
import { androidAmazon } from '../device/amazon'
import { adsReportKind, adsReportKinds, parseSupplementalRows, replaceSupplementalWindow, type AdsReportKind, type AdsSupplementalReport } from './supplemental'

interface Source { id: string; from: string; to: string; days?: string[]; bytes: number }
interface NativeStatus { configured: boolean; profileId?: string; identity?: string; revision: number; from?: string; to?: string; lastSync?: string; sources?: Source[]; download?: Source }
let cycling: Promise<void> | null = null, lastCycle = 0
const cache = new Map<AdsReportKind, { identity: string; revision: number; report: SponsoredProductsReport | AdsSupplementalReport | null }>()
let nextKind = 0

/** Native code returns bounded raw byte chunks; it never parses a large report graph. */
async function sourceText(profileId: string, source: Source, kind: AdsReportKind): Promise<string> {
  if (!Number.isSafeInteger(source.bytes) || source.bytes < 0 || source.bytes > 16 * 1024 * 1024) throw new Error('Advertising report exceeds the phone’s supported size. Previous results retained.')
  const decoder = new TextDecoder('utf-8', { fatal: true }), parts: string[] = []
  let offset = 0
  for (;;) {
    const chunk = await nativeRequest<{ data: string; next: number; done: boolean }>('ads.chunk', { profileId, kind, id: source.id, offset })
    if (!Number.isSafeInteger(chunk.next) || chunk.next < offset || chunk.next > source.bytes || (!chunk.done && chunk.next === offset)) throw new Error('Advertising download is incomplete. Previous results retained.')
    const bytes = Uint8Array.from(atob(chunk.data), character => character.charCodeAt(0))
    if (bytes.length !== chunk.next - offset) throw new Error('Advertising chunk size does not match its source.')
    parts.push(decoder.decode(bytes, { stream: !chunk.done })); offset = chunk.next
    if (chunk.done) {
      if (offset !== source.bytes) throw new Error('Advertising report is incomplete.')
      break
    }
  }
  return parts.join('')
}

/** One durable source step. Shared by foreground and the existing headless engine. */
export function syncAndroidAds(): Promise<void> {
  if (cycling) return cycling
  if (Date.now() - lastCycle < 15000) return Promise.resolve()
  lastCycle = Date.now()
  cycling = (async () => {
    const kind = adsReportKinds[nextKind++ % adsReportKinds.length]
    const result = await nativeRequest<NativeStatus>('ads.cycle', { kind })
    if (!result.configured || !result.profileId || !result.download) return
    const source = result.download
    const text = await sourceText(result.profileId, source, kind)
    try {
      const value: unknown = JSON.parse(text), range = { from: source.from, to: source.to }
      if (kind === 'advertisedProduct') parseAdsRows(value, range)
      else parseSupplementalRows(value, range, kind)
    }
    catch {
      await nativeRequest('ads.reject', { profileId: result.profileId, kind, id: source.id })
      return
    }
    await nativeRequest('ads.accept', { profileId: result.profileId, kind, id: source.id })
  })().finally(() => { cycling = null })
  return cycling
}

async function report(profileId: string, kind: AdsReportKind) {
  const index = await nativeRequest<NativeStatus>('ads.index', { profileId, kind })
  if (index.profileId !== profileId || !index.identity) throw new Error('The phone’s advertising account changed. Reopen Advertising.')
  const cached = cache.get(kind)
  if (cached?.identity === index.identity && cached.revision === index.revision) return { kind, profileId, revision: index.revision, report: cached.report }
  if (!validAdsDate(index.from) || !validAdsDate(index.to)) return { profileId, revision: index.revision, report: null }
  const rows: SponsoredProductsReport['rows'][number][] = []
  const supplementalRows: Readonly<Record<string, unknown>>[] = []
  for (const source of index.sources ?? []) {
    const days = new Set(source.days ?? [])
    const raw: unknown = JSON.parse(await sourceText(profileId, source, kind)), range = { from: source.from, to: source.to }
    if (kind === 'advertisedProduct') {
      for (const row of parseAdsRows(raw, range)) if (days.has(row.date)) rows.push(row)
    } else {
      for (const row of parseSupplementalRows(raw, range, kind)) if (days.has(String(row.date))) supplementalRows.push(row)
    }
  }
  const reading: SponsoredProductsReport | AdsSupplementalReport = kind !== 'advertisedProduct'
    ? replaceSupplementalWindow(null, { from: index.from, to: index.to }, supplementalRows, profileId, kind, index.lastSync ?? new Date().toISOString())
    : { id: `ads-api:${profileId}`, fileName: 'Amazon Ads API · Sponsored Products · 7-day click attribution', importedAt: index.lastSync ?? new Date().toISOString(),
    minDate: index.from, maxDate: index.to, rows: rows.sort((a, b) => a.date.localeCompare(b.date) || a.advertisedSku.localeCompare(b.advertisedSku)) }
  cache.set(kind, { identity: index.identity, revision: index.revision, report: reading })
  return { kind, profileId, revision: index.revision, report: reading }
}

export const nativeAdsFetch: typeof fetch = async (input, init) => {
  const signal = init?.signal
  signal?.throwIfAborted()
  const url = new URL(String(input), 'https://azulia.invalid')
  let result: unknown
  if (url.pathname === '/api/ads/entities') {
    const kind = entityKind(url.searchParams.get('kind')), profileId = url.searchParams.get('profile') ?? ''
    const page = await nativeRequest('ads.entities', { profileId, entity: kind, nextToken: url.searchParams.get('nextToken') ?? '' })
    result = parseEntityPage(kind, page, profileId, new Date().toISOString())
  } else if (url.pathname === '/api/ads/catalog') {
    const status = await nativeRequest<NativeStatus>('ads.status')
    if (status.profileId !== url.searchParams.get('profile')) throw new Error('The advertising account changed.')
    result = await androidAmazon({ action: 'catalog', asin: url.searchParams.get('asin') }, signal ?? new AbortController().signal)
  } else if (url.pathname === '/api/ads/status') {
    result = await nativeRequest<NativeStatus>('ads.status', { kind: adsReportKind(url.searchParams.get('kind') ?? 'advertisedProduct') })
    if ((result as NativeStatus).configured && (typeof document === 'undefined' || document.visibilityState === 'visible')) void syncAndroidAds().catch(() => {})
  } else if (url.pathname === '/api/ads/sync' && init?.method === 'POST') {
    result = await nativeRequest('ads.sync', JSON.parse(String(init.body)))
    void syncAndroidAds().catch(() => {})
  } else if (url.pathname === '/api/ads/report' || url.pathname === '/api/ads/dataset') {
    const kind = url.pathname === '/api/ads/report' ? 'advertisedProduct' : adsReportKind(url.searchParams.get('kind') ?? 'advertisedProduct')
    result = await report(url.searchParams.get('profile') ?? '', kind)
  } else throw new Error('Unsupported phone advertising operation.')
  signal?.throwIfAborted()
  return Response.json(result)
}
