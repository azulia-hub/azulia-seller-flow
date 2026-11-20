import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { chmod, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { SponsoredProductsReport } from '../../../src/core/advertising/types.ts'
import { adsWindows, replaceAdsWindow, shiftAdsDate, type AdsRange } from '../../../src/adapters/amazon-ads/report.ts'
import { loadAdsCredentials } from './credentials.ts'
import { AdsError, createAdsClient } from './client.ts'
import type { AdsEntityKind } from '../../../src/adapters/amazon-ads/entities.ts'
import { adsConfigurationVersion, replaceSupplementalWindow, type AdsReportKind, type AdsSupplementalReport } from '../../../src/adapters/amazon-ads/supplemental.ts'

interface Job { range: AdsRange; id?: string }
interface Saved { report: SponsoredProductsReport | null; supplemental?: AdsSupplementalReport | null; revision: number; jobs: Job[]; nextRange: AdsRange | null; lastSync: string | null; nextAttempt: number; error: string | null }
const empty = (): Saved => ({ report: null, revision: 0, jobs: [], nextRange: null, lastSync: null, nextAttempt: 0, error: null })
export interface AdsStatus {
  kind?: AdsReportKind
  configured: boolean; renewalConfigured: boolean; verified: boolean; accountName: string | null; profileId: string | null; sellerId: string | null
  state: 'idle' | 'syncing' | 'error'; revision: number; lastSync: string | null; error: string | null; nextAttempt: string | null
  from: string | null; to: string | null; rows: number; pending: number
}
export async function openAdsService(options: { directory: string; credentialsFile: string; fallbackCredentialsFile?: string; fetch?: typeof fetch; now?: () => number; autoStart?: boolean; kind?: AdsReportKind; clientFactory?: typeof createAdsClient }) {
  const clock = options.now ?? Date.now
  const kind = options.kind ?? 'advertisedProduct'
  await mkdir(options.directory, { recursive: true, mode: 0o700 })
  const file = join(options.directory, 'reports.sqlite'), db = new DatabaseSync(file)
  await chmod(file, 0o600)
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS ads_state(identity TEXT PRIMARY KEY, raw TEXT NOT NULL); CREATE TABLE IF NOT EXISTS ads_observations(id INTEGER PRIMARY KEY, identity TEXT NOT NULL, observed TEXT NOT NULL, from_date TEXT NOT NULL, to_date TEXT NOT NULL, raw TEXT NOT NULL);')
  let saved = empty(), identity = '', fingerprint = '', credentials: Awaited<ReturnType<typeof loadAdsCredentials>> = null
  let client: ReturnType<typeof createAdsClient> | null = null, verified = false, busy = false, closed = false, current: Promise<void> = Promise.resolve(), timer: ReturnType<typeof setTimeout> | undefined
  let configurationError: string | null = null, verifiedName: string | null = null
  const today = () => new Date(clock() + 330 * 60000).toISOString().slice(0, 10)
  function persist() {
    if (!identity || closed) return
    db.prepare('INSERT INTO ads_state VALUES(?,?) ON CONFLICT(identity) DO UPDATE SET raw=excluded.raw').run(identity, JSON.stringify(saved))
  }
  async function load() {
    let next: Awaited<ReturnType<typeof loadAdsCredentials>>
    try { next = await loadAdsCredentials(options.credentialsFile); if (!next && options.fallbackCredentialsFile) next = await loadAdsCredentials(options.fallbackCredentialsFile); configurationError = null }
    catch { configurationError = 'Amazon Ads credentials could not be loaded. Check npm run ads:setup and private file permissions.'; credentials = null; client = null; verified = false; return }
    if (!next) { credentials = null; client = null; verified = false; return }
    const changed = createHash('sha256').update(JSON.stringify(next)).digest('hex')
    if (changed === fingerprint && client) { credentials = next; return }
    const version = adsConfigurationVersion(kind)
    const nextIdentity = createHash('sha256').update(JSON.stringify([next.clientId, next.profileId, next.sellerId, ...(kind === 'advertisedProduct' && version === 1 ? [] : [kind, version])])).digest('hex')
    if (identity !== nextIdentity) {
      const row = db.prepare('SELECT raw FROM ads_state WHERE identity=?').get(nextIdentity) as { raw: string } | undefined
      saved = row ? JSON.parse(row.raw) as Saved : empty()
      identity = nextIdentity
    }
    credentials = next; fingerprint = changed; client = (options.clientFactory ?? createAdsClient)(next, options.fetch, clock); verified = false; verifiedName = null
    // New credentials may repair an authorization failure, but never bypass a provider cooldown.
  }
  const reading = () => kind === 'advertisedProduct' ? saved.report : saved.supplemental ?? null
  const status = (): AdsStatus => ({ kind, configured: Boolean(credentials), renewalConfigured: Boolean(credentials?.clientSecret), verified,
    accountName: credentials ? verifiedName ?? credentials.accountName : null, profileId: credentials?.profileId ?? null, sellerId: credentials?.sellerId ?? null,
    state: saved.error || configurationError ? 'error' : busy || saved.jobs.length ? 'syncing' : 'idle', revision: credentials ? saved.revision : 0,
    lastSync: credentials ? saved.lastSync : null, error: configurationError ?? (credentials ? saved.error : null),
    nextAttempt: saved.nextAttempt > clock() ? new Date(saved.nextAttempt).toISOString() : null,
    from: credentials ? reading()?.minDate ?? null : null, to: credentials ? reading()?.maxDate ?? null : null, rows: credentials ? reading()?.rows.length ?? 0 : 0, pending: credentials ? saved.jobs.length : 0 })
  function covers(range: AdsRange) { const report = reading(); return report && report.minDate <= range.from && report.maxDate >= range.to }
  async function step() {
    try {
      await load()
      if (!credentials || !client || saved.nextAttempt > clock() || closed) return
      if (!verified) { verifiedName = (await client.verify()).name; verified = true }
      if (!saved.jobs.length) {
        let range = saved.nextRange
        saved.nextRange = null
        if (!range && (!reading() || !saved.lastSync || clock() - Date.parse(saved.lastSync) >= 3600000)) {
          range = reading() ? { from: shiftAdsDate(today(), -7), to: today() } : { from: shiftAdsDate(today(), -29), to: today() }
        }
        if (!range) return
        saved.jobs = adsWindows(range, today()).map(range => ({ range })); persist()
      }
      const job = saved.jobs[0]
      if (!job.id) {
        job.id = await client.create(job.range, kind); saved.nextAttempt = clock() + 30000; saved.error = null; persist(); return
      }
      const jobStatus = await client.poll(job.id)
      if (jobStatus.status === 'FAILED') { job.id = undefined; throw new AdsError('Amazon could not generate the advertising report. Retrying later; previous results retained.', 1800) }
      if (jobStatus.status !== 'COMPLETED') { saved.nextAttempt = clock() + 30000; saved.error = null; persist(); return }
      const observed = new Date(clock()).toISOString()
      const productRows = kind === 'advertisedProduct' ? await client.download(jobStatus.url, job.range) : null
      const extraRows = kind === 'advertisedProduct' ? null : await client.downloadSupplemental(jobStatus.url, job.range, kind)
      const report = productRows ? replaceAdsWindow(saved.report, job.range, productRows, credentials.profileId, observed) : saved.report
      const supplemental = extraRows && kind !== 'advertisedProduct' ? replaceSupplementalWindow(saved.supplemental ?? null, job.range, extraRows, credentials.profileId, kind, observed) : saved.supplemental
      const next: Saved = { ...saved, report, supplemental, revision: saved.revision + 1, jobs: saved.jobs.slice(1), lastSync: observed, nextAttempt: clock() + 30000, error: null }
      // Raw unknown columns and changed observations are retained, separately from the latest report.
      db.exec('BEGIN IMMEDIATE')
      try {
        db.prepare('INSERT INTO ads_observations(identity,observed,from_date,to_date,raw) VALUES(?,?,?,?,?)').run(identity, observed, job.range.from, job.range.to, JSON.stringify(productRows ?? extraRows))
        db.prepare('INSERT INTO ads_state VALUES(?,?) ON CONFLICT(identity) DO UPDATE SET raw=excluded.raw').run(identity, JSON.stringify(next))
        db.exec('COMMIT'); saved = next
      } catch (cause) { db.exec('ROLLBACK'); throw cause }
    } catch (cause) {
      saved.error = cause instanceof AdsError ? cause.message : 'Amazon Ads sync failed. Check network, credentials and report format. Previously saved results are retained.'
      saved.nextAttempt = clock() + (cause instanceof AdsError ? cause.retrySeconds : 300) * 1000
      persist()
    }
  }
  function tick(): Promise<void> {
    if (closed || busy) return current
    busy = true
    current = step().finally(() => { busy = false })
    return current
  }
  function schedule() {
    if (closed) return
    timer = setTimeout(() => { void tick().finally(schedule) }, 10000); timer.unref()
  }
  await load()
  if (options.autoStart !== false) { void tick().finally(schedule) }
  return {
    status, tick,
    async entities(kind: AdsEntityKind, nextToken?: string | null) {
      await load()
      if (!credentials || !client) throw new AdsError('Connect Amazon Ads before loading campaign configuration.', 60, 401)
      await client.verify()
      return client.entities(kind, nextToken)
    },
    report() { return credentials ? saved.report : null },
    supplemental() { return credentials ? saved.supplemental ?? null : null },
    request(range: AdsRange, force = false) {
      adsWindows(range, today())
      if (!credentials) throw new Error('Configure the separate Amazon Ads credentials with npm run ads:setup first.')
      if (!force && covers(range)) return
      const remaining = saved.jobs
      if (remaining.length && remaining[0].range.from <= range.from && remaining.at(-1)!.range.to >= range.to) return
      saved.nextRange = range; persist(); void tick()
    },
    async close() { if (closed) return; closed = true; clearTimeout(timer); await current; db.close() },
  }
}
export type AdsService = Awaited<ReturnType<typeof openAdsService>>
