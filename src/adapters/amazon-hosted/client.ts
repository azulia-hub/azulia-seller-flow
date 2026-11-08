import { saveAnalysisView } from '../browser/activeReportStore'
import { object, text } from '../amazon-report-sync/money'
import { assertLease, commitPage, loadCache, meta, snapshot, updateMeta, type BrowserJob, type CacheMeta, type CatalogValue } from './cache'
import { missingRanges, type SyncRange } from '../../core/sync/ranges'
import type { SourceOrderSummary, SyncStatus } from '../amazon-report-sync/protocol'

export const hostedDelivery = import.meta.env.VITE_AZULIA_DELIVERY === 'netlify'
interface Credentials { clientId: string; clientSecret: string; refreshToken: string }
interface Session extends Credentials { account: string; accessToken: string; until: number }
export interface HostedView { account: string | null; connected: boolean; busy: boolean; connecting: boolean; error: string; progress: string; records: number; state: CacheMeta | null }
let view: HostedView = { account: null, connected: false, busy: false, connecting: false, error: '', progress: '', records: 0, state: null }
// Credentials and tokens are deliberately kept only in this page's memory.
let session: Session | null = null, run: AbortController | null = null, connecting: AbortController | null = null, initializing: Promise<void> | undefined
const listeners = new Set<() => void>()
export const hostedView = () => view
export const subscribeHosted = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
function publish(update: Partial<HostedView>) { view = { ...view, ...update }; listeners.forEach(listener => listener()) }
class RelayError extends Error { constructor(message: string, readonly status: number, readonly retryAfter: number) { super(message) } }
async function relay(body: Record<string, unknown>, signal: AbortSignal) {
  const response = await fetch('/.netlify/functions/amazon', { method: 'POST', cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(50000)]), headers: { 'Content-Type': 'application/json', 'X-Azulia-Intent': 'amazon-relay' }, body: JSON.stringify(body) })
  if (!response.headers.get('content-type')?.includes('application/json')) throw new RelayError('The Amazon relay is unavailable. Check the Netlify function deployment.', response.status, 60)
  const value = object(await response.json())
  if (!response.ok) throw new RelayError(text(value.error) || 'Amazon could not complete this request.', response.status, Math.max(3, Number(value.retryAfter) || Number(response.headers.get('retry-after')) || 60))
  return value
}
async function refreshView() {
  if (!view.account) return
  const state = await meta(view.account)
  // Count is refreshed only when content changed, not during every local status poll.
  const records = !view.state || state.revision !== view.state.revision ? (await loadCache(view.account)).records.length : view.records
  publish({ state, records })
}
export function initializeHosted() {
  return initializing ??= (async () => {
    let account: string | null = null
    try { const stored = localStorage.getItem('azulia.hosted-account'); if (stored && /^[a-f0-9]{64}$/.test(stored)) account = stored } catch { /* Cache selection can still be made by connecting. */ }
    if (account) { publish({ account }); await refreshView() }
  })().catch(() => { initializing = undefined; publish({ error: 'Saved browser data could not be opened. Allow website storage and reconnect.' }) })
}
export async function connectHosted(credentials: Credentials) {
  await initializeHosted()
  if (run) throw new Error('Stop the current sync before changing accounts.')
  connecting?.abort(); const abort = new AbortController(); connecting = abort
  publish({ connecting: true, error: '' })
  try {
    const value = await relay({ action: 'connect', ...credentials }, abort.signal), token = text(value.accessToken)
    if (!token) throw new Error('Amazon did not return an access token.')
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ clientId: credentials.clientId, refreshToken: credentials.refreshToken })))
    const account = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
    if (abort.signal.aborted || connecting !== abort) return
    await updateMeta(account, () => {})
    session = { ...credentials, account, accessToken: token, until: Date.now() + 45 * 60000 }
    try { localStorage.setItem('azulia.hosted-account', account) } catch { /* This page's session remains usable. */ }
    publish({ account, connected: true, records: 0, state: null, progress: 'Connected. Choose dates and press Sync now.' })
    await refreshView()
  } catch (cause) { if (!abort.signal.aborted) { publish({ error: cause instanceof Error ? cause.message : 'Connection failed.' }); throw cause } }
  finally { if (connecting === abort) { connecting = null; publish({ connecting: false }) } }
}
export function cancelHostedConnection() { connecting?.abort(); connecting = null; publish({ connecting: false }) }
export function stopHosted() { run?.abort(); publish({ progress: 'Stopping after the current request. Saved pages can be resumed.' }) }
export function disconnectHosted() { connecting?.abort(); stopHosted(); session = null; publish({ connected: false, connecting: false, progress: 'Session forgotten. Cached results remain on this device.' }) }
async function authorized(action: string, body: Record<string, unknown>, signal: AbortSignal, retry = true): Promise<Record<string, unknown>> {
  const current = session
  if (!current) throw new Error('Connect Amazon to start a sync. Cached results remain available.')
  if (Date.now() >= current.until) {
    const auth = await relay({ action: 'connect', clientId: current.clientId, clientSecret: current.clientSecret, refreshToken: current.refreshToken }, signal)
    current.accessToken = text(auth.accessToken); current.until = Date.now() + 45 * 60000
    if (!current.accessToken) throw new Error('Reconnect Amazon to continue syncing.')
  }
  try { return await relay({ action, ...body, accessToken: current.accessToken }, signal) }
  catch (cause) { if (cause instanceof RelayError && cause.status === 401 && retry) { current.until = 0; return authorized(action, body, signal, false) } throw cause }
}
function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new Error('Sync stopped.')); return }
    const stopped = () => { clearTimeout(timer); reject(new Error('Sync stopped.')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', stopped); resolve() }, milliseconds)
    signal.addEventListener('abort', stopped, { once: true })
  })
}
function orderSummary(value: unknown): SourceOrderSummary {
  const row = object(value), summary = object(row.summary)
  return { id: text(row.id), purchased: text(row.purchased), status: text(summary.status) || null, fulfillmentType: text(summary.fulfillmentType) || null, orderValue: text(summary.orderValue) || null, currency: text(summary.currency) || null }
}
const bucket = (job: BrowserJob) => job.kind === 'history' ? 'finance' : job.kind
function appendJob(state: CacheMeta, job: BrowserJob) {
  const old = state.jobs.find(value => value.id === job.id)
  if (old) { old.scope = job.scope; if (Date.now() - old.createdAt > 23 * 3600000) { old.nextToken = null; old.createdAt = Date.now() } }
  else state.jobs.push(job)
}
export async function syncHosted(days: { from: string; to: string }) {
  await initializeHosted()
  if (run || !session || !view.account || session.account !== view.account) return
  const syncStarted = Date.now(), requestCutoff = syncStarted - 5 * 60000
  const start = Date.parse(`${days.from}T00:00:00+05:30`), stop = Math.min(Date.parse(`${days.to}T00:00:00+05:30`) + 86400000, requestCutoff)
  if (!Number.isFinite(start) || !Number.isFinite(stop) || start >= stop || stop - start > 5 * 366 * 86400000 || start < Date.UTC(2010, 0, 1)) { publish({ error: 'Choose a valid date range of at most five years.' }); return }
  const wanted = { from: new Date(start).toISOString(), to: new Date(stop).toISOString() }, scope = `${days.from}/${days.to}`, account = view.account, owner = crypto.randomUUID(), abort = new AbortController()
  saveAnalysisView(`api:${account}`, { from: days.from, to: days.to, period: 'CUSTOM', basis: 'SALE_PERIOD_ORDERS', fulfillment: '' })
  run = abort; publish({ busy: true, error: '', progress: 'Preparing your requested sync…' })
  let heartbeat: ReturnType<typeof setInterval> | undefined
  const checkedUpdate = (update: (state: CacheMeta) => void) => updateMeta(account, state => { assertLease(state, owner); update(state) })
  const makeJob = (kind: BrowserJob['kind'], range: SyncRange, extra: Partial<BrowserJob> = {}): BrowserJob => ({ id: JSON.stringify([kind, range.from, range.to, extra.orderId ?? extra.asin ?? '']), scope, kind, ...range, nextToken: null, createdAt: Date.now(), ...extra })
  try {
    await updateMeta(account, state => { if (state.leaseOwner && (state.leaseUntil ?? 0) > Date.now()) throw new Error('Another tab is syncing this account. Stop that sync or wait two minutes after closing the tab.'); state.leaseOwner = owner; state.leaseUntil = Date.now() + 120000 })
    heartbeat = setInterval(() => { void checkedUpdate(state => { state.leaseUntil = Date.now() + 120000 }).catch(() => abort.abort()) }, 20000)
    await checkedUpdate(state => {
      state.catalogError = null
      for (const job of state.jobs) if (job.scope === scope && Date.now() - job.createdAt > 23 * 3600000) { job.nextToken = null; job.createdAt = Date.now() }
      for (const kind of ['purchases', 'finance'] as const) {
        const coverage = kind === 'purchases' ? state.purchaseCoverage : state.coverage
        const pending = state.jobs.filter(job => job.scope === scope && job.kind === kind)
        const gaps = missingRanges(wanted, [...coverage, ...pending])
        for (const range of gaps) appendJob(state, makeJob(kind, range))
        // Explicit refresh revisits a bounded recent overlap, never the whole saved history.
        if (coverage.length && !pending.length && !gaps.length) appendJob(state, makeJob(kind, { from: new Date(Math.max(start, stop - 3 * 86400000)).toISOString(), to: wanted.to }))
      }
    })
    const next: Record<string, number> = { ...(await meta(account)).nextAllowed }, delays: Record<string, number> = { finance: 3000, purchases: 60000, order: 3000, catalog: 3000 }
    while (!abort.signal.aborted) {
      const state = await meta(account)
      const jobs = state.jobs.filter(job => job.scope === scope)
      if (!jobs.length) {
        const cache = await loadCache(account), known = new Map(cache.orders.map(order => [order.id, order])), references = new Set<string>(), asins = new Set<string>()
        for (const record of cache.records) {
          for (const related of (Array.isArray(record.relatedIdentifiers) ? record.relatedIdentifiers : []).map(object)) if (related.relatedIdentifierName === 'ORDER_ID') references.add(text(related.relatedIdentifierValue))
          for (const item of (Array.isArray(record.items) ? record.items : []).map(object)) for (const context of (Array.isArray(item.contexts) ? item.contexts : []).map(object)) if (/^[A-Z0-9]{10}$/.test(text(context.asin))) asins.add(text(context.asin))
        }
        const planned = await checkedUpdate(current => {
          for (const id of references) if (id && !/^[A-Z0-9]{3}-\d{7}-\d{7}$/.test(id)) {
            const issue = `Unsupported order reference: ${id}. Its raw financial activity is retained for review.`
            if (!current.issues.includes(issue)) { current.issues.push(issue); current.orderDateIssues++ }
          }
          for (const id of references) if (/^[A-Z0-9]{3}-\d{7}-\d{7}$/.test(id) && !known.has(id) && Date.now() - (current.dateFailures[id] ?? 0) > 6 * 3600000) appendJob(current, makeJob('order', wanted, { orderId: id }))
          for (const order of cache.orders) if (Date.parse(order.purchased) >= start && Date.parse(order.purchased) < stop) {
            if (syncStarted - (current.orderChecked[order.id] ?? 0) > 6 * 3600000) appendJob(current, makeJob('order', wanted, { orderId: order.id }))
            if (syncStarted - (current.historyChecked[order.id] ?? 0) > 6 * 3600000 && missingRanges({ from: order.purchased, to: new Date(requestCutoff).toISOString() }, current.coverage).length) appendJob(current, makeJob('history', wanted, { orderId: order.id }))
          }
          for (const asin of asins) if (syncStarted - (current.catalogChecked[asin] ?? 0) > 7 * 86400000 && !current.catalogError) appendJob(current, makeJob('catalog', wanted, { asin }))
        })
        if (!planned.jobs.some(job => job.scope === scope)) break
        continue
      }
      jobs.sort((a, b) => (next[bucket(a)] ?? 0) - (next[bucket(b)] ?? 0) || (a.kind === 'purchases' ? 0 : 1) - (b.kind === 'purchases' ? 0 : 1) || a.id.localeCompare(b.id))
      const job = jobs[0], operation = bucket(job), pause = (next[operation] ?? 0) - Date.now()
      if (pause > 0) { publish({ progress: `Waiting for Amazon's allowance · ${jobs.length} pages/checks remaining` }); await wait(Math.min(pause, 3000), abort.signal); continue }
      publish({ progress: `${job.kind === 'purchases' ? 'Fetching orders' : job.kind === 'finance' ? 'Fetching financial activity' : job.kind === 'history' ? 'Updating linked order activity' : job.kind === 'catalog' ? 'Fetching product details' : 'Verifying order dates'} · ${jobs.length} pages/checks remaining` })
      next[operation] = Date.now() + delays[operation]
      await checkedUpdate(current => { current.nextAllowed[operation] = next[operation] })
      try {
        const action = job.kind === 'history' ? 'finance' : job.kind
        const page = await authorized(action, { from: job.from, to: job.to, orderId: job.orderId, asin: job.asin, nextToken: job.nextToken }, abort.signal)
        if (abort.signal.aborted) break
        const nextToken = text(page.nextToken) || null
        if (nextToken && nextToken === job.nextToken) throw new Error('Amazon repeated a page token. Resume the saved checkpoint later.')
        if ((job.kind === 'finance' || job.kind === 'history') && !Array.isArray(page.records)) throw new Error('Unsupported financial page; the checkpoint was not advanced.')
        if (job.kind === 'purchases' && !Array.isArray(page.orders)) throw new Error('Unsupported orders page; the checkpoint was not advanced.')
        const orders = job.kind === 'order' ? [orderSummary(page)] : job.kind === 'purchases' ? (page.orders as unknown[]).map(orderSummary) : undefined
        const issues = Array.isArray(page.issues) ? page.issues.map(value => { const issue = object(value); return `${text(issue.reason)} Source evidence: ${text(issue.raw)}` }) : []
        await commitPage(account, owner, job, { records: Array.isArray(page.records) ? page.records.map(object) : undefined, orders, issues, nextToken, catalog: job.kind === 'catalog' ? page as unknown as CatalogValue : undefined })
        await refreshView()
      } catch (cause) {
        if (abort.signal.aborted) break
        if (cause instanceof RelayError && cause.status === 429) { next[operation] = Date.now() + cause.retryAfter * 1000; await checkedUpdate(current => { current.nextAllowed[operation] = next[operation] }); continue }
        if (cause instanceof RelayError && job.kind === 'catalog') { await checkedUpdate(current => { current.catalogError = cause.message; current.jobs = current.jobs.filter(value => value.kind !== 'catalog') }); await refreshView(); continue }
        if (cause instanceof RelayError && job.kind === 'order' && [400, 404, 422].includes(cause.status)) { await checkedUpdate(current => { current.dateFailures[job.orderId!] = Date.now(); const issue = `${job.orderId}: ${cause.message}`; if (!current.issues.includes(issue)) { current.issues.push(issue); current.orderDateIssues++ } current.jobs = current.jobs.filter(value => value.id !== job.id) }); await refreshView(); continue }
        throw cause
      }
    }
    publish({ progress: abort.signal.aborted ? 'Sync stopped. Completed pages are saved; press Sync now to resume.' : 'Requested sync complete. New Amazon activity is fetched only when you press Sync now.' })
  } catch (cause) { if (!abort.signal.aborted) { if (cause instanceof RelayError && cause.status === 401) { session = null; publish({ connected: false }) } publish({ error: cause instanceof Error ? cause.message : 'Sync failed. Saved pages remain available.' }) } }
  finally {
    if (heartbeat) clearInterval(heartbeat)
    await updateMeta(account, state => { if (state.leaseOwner === owner) { state.leaseOwner = null; state.leaseUntil = 0 } }).catch(() => {})
    if (run === abort) run = null
    publish({ busy: false }); await refreshView().catch(() => {})
  }
}
export async function hostedFetch(input: string, init?: RequestInit): Promise<Response> {
  await initializeHosted()
  if (input.startsWith('/api/report-sync/range')) return Response.json({ queued: false, onDemand: true })
  await refreshView()
  if (input.startsWith('/api/report-sync/status')) {
    const state = view.state
    const status: SyncStatus = { onDemand: true, connectionKey: view.account ?? '', configured: Boolean(view.account), revision: state?.revision ?? 0, records: view.records, missingWindows: state?.jobs.filter(job => job.kind === 'finance' || job.kind === 'purchases').length ?? 0, coverage: state?.coverage ?? [], state: view.busy ? 'syncing' : view.error ? 'error' : 'idle', lastSync: state?.lastSync ?? null, nextAttempt: null, error: view.error || null, catalogError: state?.catalogError, orderDateIssues: state?.orderDateIssues, pendingOrderCycles: state?.jobs.filter(job => job.kind === 'history').length, pendingOrderDates: state?.jobs.filter(job => job.kind === 'order').length }
    return Response.json(status)
  }
  if (input.startsWith('/api/report-sync/data') && view.account) {
    const after = new URL(input, location.origin).searchParams.get('after')
    if (after !== null && Number(after) === view.state?.revision) return new Response(null, { status: 204 })
    return Response.json(await snapshot(view.account))
  }
  if (init?.signal?.aborted) throw new Error('Delivery stopped.')
  return Response.json({ error: 'Unsupported browser delivery request.' }, { status: 400 })
}
