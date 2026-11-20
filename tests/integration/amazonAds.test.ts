import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, chmod, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { gzipSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { createAdsClient, safeAdsDownloadUrl } from '../../server/local/ads/client'
import { loadAdsCredentials, saveAdsCredentials, type AdsCredentials } from '../../server/local/ads/credentials'
import { openAdsService } from '../../server/local/ads/service'

const credentials: AdsCredentials = { clientId: 'amzn1.application-oa2-client.ads', clientSecret: 'secret-value', refreshToken: 'refresh-value', profileId: '123', sellerId: 'SELLER123', accountName: 'Shop' }
const profile = { profileId: 123, countryCode: 'IN', currencyCode: 'INR', accountInfo: { id: 'SELLER123', type: 'seller', name: 'Shop' } }
const raw = { date: '2026-11-18', campaignName: 'Campaign', advertisedSku: 'SKU', advertisedAsin: 'B012345678', impressions: 20, clicks: 3, cost: 12.45, sales7d: 100, attributedSalesSameSku7d: 90, salesOtherSku7d: 10, purchases7d: 1, unitsSoldClicks7d: 1, unknownMetric: 42 }
const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const item of cleanup.splice(0).reverse()) await item() })
async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'ads-test-')); cleanup.push(() => rm(path, { force: true, recursive: true })); return path
}
function upstream() {
  return vi.fn<typeof fetch>(async (url, init) => {
    const path = String(url)
    if (path.includes('/auth/o2/token')) return Response.json({ access_token: 'private-access', expires_in: 3600 })
    if (path.endsWith('/v2/profiles')) return Response.json([profile])
    if (path.endsWith('/reporting/reports') && init?.method === 'POST') return Response.json({ reportId: 'job-123' })
    if (path.endsWith('/reporting/reports/job-123')) return Response.json({ status: 'COMPLETED', url: 'https://reports.s3.eu-west-1.amazonaws.com/report.gz?signature=private' })
    if (path.startsWith('https://reports.s3.eu-west-1.amazonaws.com/')) return new Response(gzipSync(JSON.stringify([raw])))
    throw new Error('Unexpected URL')
  })
}
describe('separate Amazon Ads authorization and reports', () => {
  it('reads configuration with the entity-specific media type and retains authoritative bids', async () => {
    const request = upstream(), normal = request.getMockImplementation()!
    request.mockImplementation(async (url, init) => String(url).endsWith('/sp/keywords/list') ? Response.json({ keywords: [{ campaignId: 'c', adGroupId: 'g', keywordId: 'k', state: 'ENABLED', bid: 4.5, futureField: true }], nextToken: 'page-two' }) : normal(url, init))
    const page = await createAdsClient(credentials, request).entities('keywords')
    expect(page.rows[0]).toMatchObject({ bid: 4.5, futureField: true })
    expect(page.nextToken).toBe('page-two')
    const call = request.mock.calls.find(([url]) => String(url).endsWith('/sp/keywords/list'))!
    expect(call[1]?.headers).toMatchObject({ 'Content-Type': 'application/vnd.spKeyword.v3+json', Accept: 'application/vnd.spKeyword.v3+json' })
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({ maxResults: 100, stateFilter: { include: ['ENABLED', 'PAUSED', 'ARCHIVED'] } })
  })
  it('loads the real strip-types Node service entry without bundler-only import resolution', () => {
    expect(execFileSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', "await import('./server/local/ads/service.ts'); console.log('ready')"], { encoding: 'utf8' }).trim()).toBe('ready')
  })
  it('partitions supplemental jobs, raw observations and cache restarts from product totals', async () => {
    const dir = await directory(), file = join(dir, 'credentials.json'), cache = join(dir, 'cache')
    await saveAdsCredentials(file, credentials)
    let now = Date.parse('2026-11-18T12:00:00Z')
    const productFetch = upstream(), termFetch = upstream(), normal = termFetch.getMockImplementation()!
    termFetch.mockImplementation(async (url, init) => String(url).startsWith('https://reports.s3.') ? new Response(gzipSync(JSON.stringify([{ ...raw, campaignId: 'c', adGroupId: 'g', searchTerm: 'wood desk', cost: 999 }]))) : normal(url, init))
    const product = await openAdsService({ directory: cache, credentialsFile: file, fetch: productFetch, now: () => now, autoStart: false })
    const terms = await openAdsService({ directory: cache, credentialsFile: file, fetch: termFetch, now: () => now, autoStart: false, kind: 'searchTerm' })
    cleanup.push(() => product.close())
    await product.tick(); await terms.tick(); now += 31000; await product.tick(); await terms.tick()
    expect(product.report()?.rows[0].spendExcludingTax).toBe(12.45)
    expect(terms.report()).toBeNull()
    expect(terms.supplemental()?.rows[0].cost).toBe(999)
    expect(JSON.parse(String(termFetch.mock.calls.find(([url, init]) => String(url).endsWith('/reporting/reports') && init?.method === 'POST')![1]?.body)).configuration.reportTypeId).toBe('spSearchTerm')
    await terms.close()
    const restarted = await openAdsService({ directory: cache, credentialsFile: file, fetch: termFetch, now: () => now, autoStart: false, kind: 'searchTerm' })
    cleanup.push(() => restarted.close())
    await restarted.tick()
    expect(restarted.supplemental()?.rows[0].searchTerm).toBe('wood desk')
    expect(restarted.supplemental()?.rows[0].unknownMetric).toBe(42)
    expect(product.supplemental()).toBeNull()
  })
  it('loads only private Ads files, separately from seller API, without leaking parse errors', async () => {
    const dir = await directory(), file = join(dir, 'credentials.json')
    expect(await loadAdsCredentials(file)).toBeNull()
    await saveAdsCredentials(file, credentials)
    expect(await loadAdsCredentials(file)).toEqual(credentials)
    await symlink(file, join(dir, 'link'))
    await expect(loadAdsCredentials(join(dir, 'link'))).rejects.toThrow('Cannot load private')
    await chmod(file, 0o644)
    await expect(loadAdsCredentials(file)).rejects.toThrow('600')
    expect(await readFile(file, 'utf8')).toContain('refresh-value')
  })
  it('renews expired access tokens and never sends credentials to signed download URLs', async () => {
    let now = Date.parse('2026-11-18T12:00:00Z')
    const request = upstream(), client = createAdsClient(credentials, request, () => now)
    await client.verify(); await client.verify()
    expect(request.mock.calls.filter(([url]) => String(url).includes('/auth/o2/token'))).toHaveLength(1)
    now += 3600000; await client.verify()
    expect(request.mock.calls.filter(([url]) => String(url).includes('/auth/o2/token'))).toHaveLength(2)
    expect(await client.create({ from: '2026-11-01', to: '2026-11-18' })).toBe('job-123')
    const job = await client.poll('job-123'), rows = await client.download(job.url, { from: '2026-11-01', to: '2026-11-18' })
    expect(rows[0].raw?.unknownMetric).toBe(42)
    const download = request.mock.calls.find(([url]) => String(url).startsWith('https://reports.s3.'))!
    expect(download[1]?.headers).toBeUndefined()
    expect(request.mock.calls.find(([url]) => String(url).endsWith('/reporting/reports'))![1]?.headers).toMatchObject({ 'Amazon-Advertising-API-Scope': '123', 'Amazon-Advertising-API-ClientId': credentials.clientId })
  })
  it('rejects vendor/wrong seller profiles and unsafe report download targets', async () => {
    const request = upstream()
    request.mockImplementation(async url => String(url).includes('/auth/') ? Response.json({ access_token: 'private-access', expires_in: 3600 }) : Response.json([{ ...profile, accountInfo: { ...profile.accountInfo, type: 'vendor' } }]))
    await expect(createAdsClient(credentials, request).verify()).rejects.toThrow('does not match')
    for (const url of ['http://reports.s3.amazonaws.com/file', 'https://127.0.0.1/file', 'https://s3.amazonaws.com.evil.test/file', 'https://user@reports.s3.amazonaws.com/file', 'https://reports.s3.amazonaws.com:8443/file']) expect(() => safeAdsDownloadUrl(url)).toThrow()
  })
  it('keeps provider cooldowns and sanitizes rejected refresh errors', async () => {
    const rejected = vi.fn<typeof fetch>(async () => Response.json({ error_description: 'secret-value refresh-value private-access' }, { status: 400 }))
    await expect(createAdsClient(credentials, rejected).verify()).rejects.toThrow('authorization was rejected')
    const limited = vi.fn<typeof fetch>(async url => String(url).includes('/auth/') ? Response.json({ access_token: 'private-access', expires_in: 3600 }) : Response.json({}, { status: 429, headers: { 'Retry-After': '120' } }))
    await expect(createAdsClient(credentials, limited).verify()).rejects.toMatchObject({ retrySeconds: 120 })
  })
  it('resumes async jobs from disk and replaces overlaps without duplicating spend', async () => {
    const dir = await directory(), file = join(dir, 'credentials.json'), cache = join(dir, 'cache')
    await saveAdsCredentials(file, credentials)
    let now = Date.parse('2026-11-18T12:00:00Z')
    const request = upstream()
    const service = await openAdsService({ directory: cache, credentialsFile: file, fetch: request, now: () => now, autoStart: false })
    await service.tick()
    expect(service.status()).toMatchObject({ verified: true, pending: 1, revision: 0 })
    await service.close()
    const restarted = await openAdsService({ directory: cache, credentialsFile: file, fetch: request, now: () => now, autoStart: false })
    cleanup.push(() => restarted.close())
    now += 31000; await restarted.tick()
    expect(restarted.status()).toMatchObject({ revision: 1, rows: 1, pending: 0 })
    expect(request.mock.calls.filter(([url, init]) => String(url).endsWith('/reporting/reports') && init?.method === 'POST')).toHaveLength(1)
    now += 3600000; await restarted.tick(); now += 31000; await restarted.tick()
    expect(restarted.report()?.rows).toHaveLength(1)
    expect(restarted.report()?.rows[0].spendExcludingTax).toBe(12.45)
    expect(JSON.stringify(restarted.status())).not.toMatch(/secret-value|refresh-value|private-access/)
  })
  it('keeps the previous successful report when a refreshed source row is malformed', async () => {
    const dir = await directory(), file = join(dir, 'credentials.json')
    await saveAdsCredentials(file, credentials)
    let now = Date.parse('2026-11-18T12:00:00Z')
    const request = upstream(), service = await openAdsService({ directory: join(dir, 'cache'), credentialsFile: file, fetch: request, now: () => now, autoStart: false })
    cleanup.push(() => service.close())
    await service.tick(); now += 31000; await service.tick()
    const before = service.report()
    const normal = request.getMockImplementation()!
    request.mockImplementation(async (url, init) => String(url).startsWith('https://reports.s3.') ? new Response(gzipSync(JSON.stringify([{ ...raw, cost: null }]))) : normal(url, init))
    now += 3600000; await service.tick(); now += 31000; await service.tick()
    expect(service.report()).toEqual(before)
    expect(service.status().state).toBe('error')
  })
  it('loads credentials added after startup without restarting the app', async () => {
    const dir = await directory(), file = join(dir, 'private', 'credentials.json')
    const service = await openAdsService({ directory: join(dir, 'cache'), credentialsFile: file, fetch: upstream(), autoStart: false })
    cleanup.push(() => service.close())
    expect(service.status().configured).toBe(false)
    await mkdir(join(dir, 'private'), { mode: 0o700 }); await saveAdsCredentials(file, credentials)
    await service.tick()
    expect(service.status()).toMatchObject({ configured: true, verified: true })
  })
})
