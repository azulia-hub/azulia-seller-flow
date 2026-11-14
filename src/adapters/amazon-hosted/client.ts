import {runReviewCycle} from '../amazon-reviews/service'
import {reviewOrders} from '../amazon-reviews/orders'
import type {ReviewOrder} from '../../core/review-requests/types'
import { syncInventory } from '../amazon-inventory/syncInventory'
import { inventoryStorage } from '../amazon-inventory/storage'
import type { InventoryState } from '../amazon-inventory/workspaceTypes'
import { currentPreferences } from '../preferences/runtime'
export const backgroundEngine = typeof document !== 'undefined' && document.documentElement?.dataset.background === 'true'
import { enrichmentTargets, pickSyncJob } from './enrichment'
export { hostedDelivery } from './deliveryMode'
import { object, text } from '../amazon-report-sync/money'
import { assertLease, commitPage, loadCache, recordCount, meta, snapshot, updateMeta, type BrowserJob, type CacheMeta, type CatalogValue } from './cache'
import { missingRanges, type SyncRange } from '../../core/sync/ranges'
import { toIndiaDateString, indiaDateToUtcIso, getIndiaToday, stableJobId, SyncRunTracker } from '../../core/sync/planner'
import type { SourceOrderSummary, SyncStatus } from '../amazon-report-sync/protocol'
import { androidDevice, nativeRequest, DEVICE_BRIDGE_VERSION } from '../device/bridge'
import { androidAmazon } from '../device/amazon'
interface Credentials { clientId: string; clientSecret: string; refreshToken: string }
interface Session extends Credentials { account: string; accessToken: string; until: number }
export interface HostedView { account: string | null; connected: boolean; busy: boolean; connecting: boolean; error: string; progress: string; records: number; state: CacheMeta | null; percent?: number; backgroundNote?: string }
const STORAGE_ACCOUNT_KEY = 'azulia.hosted-account'
const STORAGE_CREDS_KEY = 'azulia.hosted-creds'
let view: HostedView = { account: null, connected: false, busy: false, connecting: false, error: '', progress: '', records: 0, state: null }
let session: Session | null = null, run: AbortController | null = null, connecting: AbortController | null = null, initializing: Promise<void> | undefined
let resumeAfterHandoff = false
let wakeLock: { release: () => Promise<void> } | null = null
async function acquireWakeLock() {
  if(backgroundEngine)return
  try {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && typeof (navigator as any).wakeLock?.request === 'function') {
      wakeLock = await (navigator as any).wakeLock.request('screen')
    }
  } catch {}
}
function releaseWakeLock() {
  try {
    if (wakeLock) {
      void wakeLock.release()
      wakeLock = null
    }
  } catch {}
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && run) {
      void acquireWakeLock()
    }
  })
}
const listeners = new Set<() => void>()
export const hostedView = () => view
export const subscribeHosted = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
function publish(update: Partial<HostedView>) { view = { ...view, ...update }; listeners.forEach(listener => listener()) }
async function digestAccount(clientId: string, refreshToken: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ clientId, refreshToken })))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
class RelayError extends Error { constructor(message: string, readonly status: number, readonly retryAfter: number) { super(message) } }
async function relay(body: Record<string, unknown>, signal: AbortSignal) {
  if (androidDevice) {
    try { return await androidAmazon(body, signal) }
    catch (cause) { const error = cause as Error & { status?: number; retryAfter?: number }; throw new RelayError(error.message || 'Phone connection unavailable.', error.status ?? 0, error.retryAfter ?? 60) }
  }
  const response = await fetch('/.netlify/functions/amazon', { method: 'POST', cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(50000)]), headers: { 'Content-Type': 'application/json', 'X-Azulia-Intent': 'amazon-relay' }, body: JSON.stringify(body) })
  if (!response.headers.get('content-type')?.includes('application/json')) throw new RelayError('The Amazon relay is unavailable. Check the Netlify function deployment.', response.status, 60)
  const value = object(await response.json())
  if (!response.ok) throw new RelayError(text(value.error) || 'Amazon could not complete this request.', response.status, Math.max(3, Number(value.retryAfter) || Number(response.headers.get('retry-after')) || 60))
  return value
}
async function refreshView() {
  if (!view.account) return
  const state = await meta(view.account)
  if(androidDevice&&!backgroundEngine) {
    const native=await nativeRequest<{busy:boolean;phase:string;message:string;error?:string;lastSuccess?:number}>('sync.status')
    publish({busy:native.busy,progress:native.message,error:native.error||'',backgroundNote:native.lastSuccess?`Data and calculations saved: ${new Date(native.lastSuccess).toLocaleString('en-IN')}`:undefined})
  }
  // Count is refreshed only when content changed, not during every local status poll.
  const records = !view.state || state.revision !== view.state.revision ? await recordCount(view.account) : view.records
  publish({ state, records })
}
let autoSyncTimer: ReturnType<typeof setInterval> | null = null
const detailPriority=new Set<string>()
let detailRequestVersion=0
export function requestOrderDetails(orderIds:readonly string[],range:{from:string;to:string}) {
  detailPriority.clear()
  for(const id of orderIds.slice(0,250))if(/^[A-Z0-9]{3}-\d{7}-\d{7}$/.test(id))detailPriority.add(id)
  detailRequestVersion++
  if(androidDevice&&!backgroundEngine){void nativeRequest('sync.details',{...range,orderIds:[...detailPriority]}).catch(()=>{});return}
  if(!backgroundEngine && orderIds.length && session && !run && !view.connecting)void syncHosted(range,{silent:true})
}

let backgroundDrain: Promise<void> | null = null
async function readBackgroundPages(account: string) {
  const pages = await nativeRequest<{ id: string; job: BrowserJob }[]>('background.pending', { account })
  if (!pages.length) return
  const owner = crypto.randomUUID()
  await updateMeta(account, state => {
    if (state.leaseOwner && (state.leaseUntil ?? 0) > Date.now()) throw new Error('A sync is already running; background pages remain saved.')
    state.leaseOwner = owner; state.leaseUntil = Date.now() + 120000
  })
  let cancelled=false
  const heartbeat=setInterval(() => { void updateMeta(account,state=>{ assertLease(state,owner);state.leaseUntil=Date.now()+120000 }).catch(()=>{cancelled=true}) },20000)
  try {
    for (const saved of pages) {
      if (session?.account !== account || cancelled || (!backgroundEngine && document.visibilityState !== 'visible')) return
      const page = await androidAmazon({ ...saved.job, action: saved.job.kind, backgroundId: saved.id, account }, AbortSignal.timeout(60000))
      if (saved.job.kind === 'finance' && !Array.isArray(page.records) || saved.job.kind === 'purchases' && !Array.isArray(page.orders)) throw new Error('Background page could not be parsed. Its source is retained.')
      let job = saved.job
      await updateMeta(account, state => {
        assertLease(state, owner)
        const existing = state.jobs.find(item => item.kind === job.kind && item.from === job.from && item.to === job.to && item.nextToken === job.nextToken && Boolean(item.updatedOnly) === Boolean(job.updatedOnly))
        if (existing) job = existing
        else if (!state.jobs.some(item => item.id === job.id)) state.jobs.push(job)
      })
      const issues = Array.isArray(page.issues) ? page.issues.map(value => { const issue = object(value); return `${text(issue.reason)} Source evidence: ${text(issue.raw)}` }) : []
      await commitPage(account, owner, job, { backgroundId: saved.id, nextToken: text(page.nextToken) || null,
        records: Array.isArray(page.records) ? page.records.map(object) : undefined,
        orders: Array.isArray(page.orders) ? page.orders.map(orderSummary) : undefined, issues })
    }
  } finally { clearInterval(heartbeat); await updateMeta(account, state => { if (state.leaseOwner === owner) { state.leaseOwner = null; state.leaseUntil = 0 } }).catch(() => {}) }
}
function consumeBackground(account: string) {
  return backgroundDrain ??= readBackgroundPages(account).finally(() => { backgroundDrain = null })
}
async function resumeAndroid() {
  if (!androidDevice || !session || !view.account || (!backgroundEngine && document.visibilityState !== 'visible')) return
  if (run) return
  try {
    if(!backgroundEngine){await refreshView();const force=resumeAfterHandoff;resumeAfterHandoff=false;triggerRecentCheck(force);return}
    await consumeBackground(view.account)
    const native=await nativeRequest<{backgroundStatus?:{lastFetch?:number;error?:string}|null}>('session.status')
    const backgroundNote=native.backgroundStatus?.error || (native.backgroundStatus?.lastFetch ? `Background data fetched: ${new Date(native.backgroundStatus.lastFetch).toLocaleString('en-IN')}` : undefined)
    if(document.visibilityState!=='visible')return
    const force=resumeAfterHandoff;resumeAfterHandoff=false
    publish({progress:'',error:'',backgroundNote});await refreshView();triggerRecentCheck(force)
  } catch { publish({ error: 'Saved background pages are waiting to be applied. Retrying automatically; data remains on this phone.' }) }
}

export function triggerRecentCheck(force = false) {
  if(androidDevice&&!backgroundEngine){if(force&&session)void nativeRequest('sync.request',{force:false}).catch(()=>{});return}
  if (!session || !view.account || run || backgroundDrain || view.connecting) return
  const state = view.state
  const last = state?.lastSync ? Date.parse(state.lastSync) : 0
  if (force || !last || Date.now() - last > currentPreferences().syncMinutes * 60000) {
    const today = getIndiaToday()
    const yesterday = toIndiaDateString(Date.now() - 86400000) ?? today
    void syncHosted({ from: yesterday, to: today }, { silent: true, forceRecent: force })
  }
}

export function ensureAutoSyncLoop() {
  if(backgroundEngine)return
  if (autoSyncTimer || typeof window === 'undefined') return
  autoSyncTimer = setInterval(() => {
    if (document.visibilityState === 'visible') {
      if (androidDevice) void resumeAndroid(); else triggerRecentCheck(false)
    }
  }, 45000)
}

if (typeof window !== 'undefined' && !backgroundEngine) {
  window.addEventListener('focus', () => {
    if (androidDevice) void resumeAndroid(); else triggerRecentCheck(false)
  })
  document.addEventListener('visibilitychange', () => { if (androidDevice) { if (document.visibilityState === 'visible') void resumeAndroid(); else { if(run)resumeAfterHandoff=true; stopHosted('background') } } })
}

export function initializeHosted() {
  return initializing ??= (async () => {
    if (androidDevice) {
      const state = await nativeRequest<{ bridgeVersion: number; account: string | null; configured: boolean; backgroundStatus?: { error?: string; lastFetch?: number } | null }>('session.status')
      if (state.bridgeVersion !== DEVICE_BRIDGE_VERSION) throw new Error('This website needs a compatible Android app update.')
      if (state.account) {
        session = state.configured ? { account: state.account, clientId: '', clientSecret: '', refreshToken: '', accessToken: 'native-managed', until: Infinity } : null
        publish({ account: state.account, connected: Boolean(session), backgroundNote: state.backgroundStatus?.error || (state.backgroundStatus?.lastFetch ? `Background data fetched: ${new Date(state.backgroundStatus.lastFetch).toLocaleString('en-IN')}` : 'Background fetch is scheduled by Android.') })
        ensureAutoSyncLoop()
        if (session && backgroundEngine) { try { await consumeBackground(state.account) } catch { publish({error:'Saved background pages are waiting for their writer lease. Retrying automatically.'}) } }
        await refreshView()
        if(!backgroundEngine)setTimeout(() => triggerRecentCheck(true),1200)
      }
      return
    }
    let account: string | null = null
    try { const stored = localStorage.getItem(STORAGE_ACCOUNT_KEY); if (stored && /^[a-f0-9]{64}$/.test(stored)) account = stored } catch { /* Cache selection can still be made by connecting. */ }
    let creds: Credentials | null = null
    try {
      const storedCreds = localStorage.getItem(STORAGE_CREDS_KEY)
      if (storedCreds) {
        const parsed = JSON.parse(storedCreds)
        if (typeof parsed?.clientId === 'string' && typeof parsed?.clientSecret === 'string' && typeof parsed?.refreshToken === 'string') {
          creds = { clientId: parsed.clientId.trim(), clientSecret: parsed.clientSecret.trim(), refreshToken: parsed.refreshToken.trim() }
        }
      }
    } catch { /* Storage disabled or data invalid */ }
    if (creds && creds.clientId && creds.clientSecret && creds.refreshToken) {
      account = await digestAccount(creds.clientId, creds.refreshToken)
      session = { ...creds, account, accessToken: '', until: 0 }
      publish({ account, connected: true, progress: '' })
      void (async () => {
        try {
          const auth = await relay({ action: 'connect', ...creds }, AbortSignal.timeout(12000))
          const token = text(auth.accessToken)
          if (token && session && session.account === account) {
            session.accessToken = token
            session.until = Date.now() + 45 * 60000
          }
        } catch (cause) {
          if (cause instanceof RelayError && (cause.status === 400 || cause.status === 401)) {
            session = null
            try { localStorage.removeItem(STORAGE_CREDS_KEY) } catch {}
            publish({ connected: false, error: 'Saved Amazon credentials expired or were revoked. Reconnect to continue.' })
          }
        }
      })()
    } else if (account) {
      publish({ account })
    }
    if (account) {
      await refreshView()
      ensureAutoSyncLoop()
      const isReload = typeof performance !== 'undefined' && (performance.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined)?.type === 'reload'
      setTimeout(() => triggerRecentCheck(Boolean(isReload)), isReload ? 1200 : 2500)
    }
  })().catch(cause => { initializing = undefined; publish({ error: androidDevice ? cause instanceof Error ? cause.message : 'Phone data could not be opened. Reopen the app.' : 'Saved browser data could not be opened. Allow website storage and reconnect.' }) })
}
export async function connectHosted(credentials: Credentials, remember = true) {
  await initializeHosted()
  if (run) throw new Error('Stop the current sync before changing accounts.')
  connecting?.abort(); const abort = new AbortController(); connecting = abort
  publish({ connecting: true, error: '' })
  try {
    const value = await relay({ action: 'connect', ...credentials }, abort.signal), token = text(value.accessToken)
    if (!token) throw new Error('Amazon did not return an access token.')
    const account = await digestAccount(credentials.clientId, credentials.refreshToken)
    if (abort.signal.aborted || connecting !== abort) return
    await updateMeta(account, () => {})
    session = androidDevice ? { account, clientId: '', clientSecret: '', refreshToken: '', accessToken: 'native-managed', until: Infinity } : { ...credentials, account, accessToken: token, until: Date.now() + 45 * 60000 }
    try {
      if (!androidDevice) localStorage.setItem(STORAGE_ACCOUNT_KEY, account)
      if (remember && !androidDevice) localStorage.setItem(STORAGE_CREDS_KEY, JSON.stringify(credentials))
      else localStorage.removeItem(STORAGE_CREDS_KEY)
    } catch { /* This page's session remains usable. */ }
    publish({ account, connected: true, records: 0, state: null, progress: 'Connected. Choosing dates and synchronizing…' })
    await refreshView()
    ensureAutoSyncLoop()
    setTimeout(() => triggerRecentCheck(true), 1000)
  } catch (cause) { if (!abort.signal.aborted) { publish({ error: cause instanceof Error ? cause.message : 'Connection failed.' }); throw cause } }
  finally { if (connecting === abort) { connecting = null; publish({ connecting: false }) } }
}
export function cancelHostedConnection() { connecting?.abort(); connecting = null; if (androidDevice) void nativeRequest('session.cancel').catch(() => {}); publish({ connecting: false }) }
export function stopHosted(reason: 'manual' | 'background' = 'manual') { run?.abort(reason); publish({ progress: reason === 'background' ? 'Android continues fetching; saved updates apply when you return.' : 'Stopping after the current request. Saved pages can be resumed.' }) }
export function disconnectHosted() { if (autoSyncTimer) { clearInterval(autoSyncTimer); autoSyncTimer = null }; connecting?.abort(); stopHosted(); session = null; initializing = undefined; try { localStorage.removeItem(STORAGE_CREDS_KEY) } catch {}; if (androidDevice) void nativeRequest('session.forget').catch(() => publish({ error: 'Phone credentials could not be removed. Retry Forget credentials.' })); publish({ connected: false, connecting: false, backgroundNote: undefined, progress: 'Saved credentials forgotten. Cached results remain on this device.' }) }
async function authorized(action: string, body: Record<string, unknown>, signal: AbortSignal, retry = true): Promise<Record<string, unknown>> {
  const current = session
  if (!current) throw new Error('Connect Amazon to start a sync. Cached results remain available.')
  if (!androidDevice && Date.now() >= current.until) {
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
  return {
    isReplacementOrder:typeof summary.isReplacementOrder==='boolean'?summary.isReplacementOrder:typeof row.isReplacementOrder==='boolean'?row.isReplacementOrder:null,
    replacedOrderId:text(summary.replacedOrderId)||text(row.replacedOrderId)||null,earliestDeliveryDate:text(summary.earliestDeliveryDate)||text(row.earliestDeliveryDate)||null,latestDeliveryDate:text(summary.latestDeliveryDate)||text(row.latestDeliveryDate)||null,reviewMetadataCheckedAt:text(summary.reviewMetadataCheckedAt)||text(row.reviewMetadataCheckedAt)||null,
    id: text(row.id),
    purchased: text(row.purchased),
    status: text(summary.status) || text(row.status) || null,
    fulfillmentType: text(summary.fulfillmentType) || text(row.fulfillmentType) || null,
    orderValue: text(summary.orderValue) || text(row.orderValue) || null,
    currency: text(summary.currency) || text(row.currency) || null,
    sku: text(summary.sku) || text(row.sku) || null,
    asin: text(summary.asin) || text(row.asin) || null,
    title: text(summary.title) || text(row.title) || null,
    imageUrl: text(summary.imageUrl) || text(row.imageUrl) || null,
    items: Array.isArray(summary.items) ? summary.items as any : Array.isArray(row.items) ? row.items as any : undefined,
  }
}
const bucket = (job: BrowserJob) => job.kind === 'history' ? 'finance' : job.kind
function appendJob(state: CacheMeta, job: BrowserJob) {
  const old = state.jobs.find(value => value.id === job.id)
  if (old) {
    old.scope = job.scope
    if (job.lane) old.lane = job.lane
    if (Date.now() - old.createdAt > 23 * 3600000) { old.nextToken = null; old.createdAt = Date.now() }
  } else state.jobs.push(job)
}
export async function syncHosted(days: { from: string; to: string }, options?: { silent?: boolean; forceRecent?: boolean; forceHistory?:boolean; budgetMs?:number }) {
  await initializeHosted()
  if(androidDevice && !backgroundEngine) {await nativeRequest('sync.request',{...days,force:Boolean(options?.forceHistory),orderIds:[...detailPriority]});return}
  if (run || backgroundDrain || !session || !view.account || session.account !== view.account) return
  const syncStarted = Date.now(), requestCutoff = syncStarted - 5 * 60000, ordersCutoff = syncStarted - 2 * 60000
  const start = Date.parse(indiaDateToUtcIso(days.from)), stop = Math.min(Date.parse(indiaDateToUtcIso(days.to, true)), requestCutoff)
  if (!Number.isFinite(start) || !Number.isFinite(stop) || start >= stop || stop - start > 5 * 366 * 86400000 || start < Date.UTC(2010, 0, 1)) { publish({ error: 'Choose a valid date range of at most five years.' }); return }
  const wanted = { from: new Date(start).toISOString(), to: new Date(stop).toISOString() }, scope = `${days.from}/${days.to}`, account = view.account, owner = crypto.randomUUID(), abort = new AbortController()
  const tracker = new SyncRunTracker(owner)
  const deadline=Date.now()+(options?.budgetMs??Number.POSITIVE_INFINITY)
  run = abort; publish({ busy: true, error: '', progress: options?.silent ? 'Syncing latest Amazon orders…' : 'Preparing your requested sync…' })
  let heartbeat: ReturnType<typeof setInterval> | undefined
  const checkedUpdate = (update: (state: CacheMeta) => void) => updateMeta(account, state => { assertLease(state, owner); update(state) })
  const makeJob = (kind: BrowserJob['kind'], range: SyncRange, extra: Partial<BrowserJob> = {}): BrowserJob => ({
    id: stableJobId(kind, range.from, range.to, extra.orderId ?? extra.asin ?? (extra.updatedOnly ? 'updated' : '')),
    scope,
    kind,
    ...range,
    nextToken: null,
    createdAt: Date.now(),
    state: 'pending',
    runId: owner,
    retries: 0,
    ...extra,
  })
  let metadataTracker=tracker,metadataIntent=-1
  async function queueMetadata() {
    if(metadataIntent!==detailRequestVersion){metadataTracker=detailPriority.size?new SyncRunTracker(owner+':details:'+detailRequestVersion):tracker;metadataIntent=detailRequestVersion}
    const cache=await loadCache(account)
    const visibleOrders=detailPriority.size?cache.orders.filter(order=>detailPriority.has(order.id)):cache.orders
    const targets=enrichmentTargets(visibleOrders,cache.catalog,cache.meta,metadataTracker,detailPriority,Date.now())
    const asins=new Set(targets.asins)
    if(!detailPriority.size)for(const record of cache.records)for(const item of (Array.isArray(record.items)?record.items:[]).map(object))for(const context of (Array.isArray(item.contexts)?item.contexts:[]).map(object))if(/^[A-Z0-9]{10}$/.test(text(context.asin)))asins.add(text(context.asin))
    await checkedUpdate(current=>{
      const enqueue=(kind:'orderItems'|'catalog',resource:string,extra:Partial<BrowserJob>)=>{
        const existing=current.jobs.find(job=>job.kind===kind && (kind==='orderItems'?job.orderId===resource:job.asin===resource))
        if(existing){existing.scope=scope;if(Date.now()-existing.createdAt>23*3600000){existing.createdAt=Date.now();existing.nextToken=null};return}
        if(!metadataTracker.canEnqueue(kind,resource))return
        metadataTracker.recordEnqueued(kind,resource);appendJob(current,makeJob(kind,wanted,extra))
      }
      for(const order of targets.items.slice(0,10))enqueue('orderItems',order.id,{orderId:order.id})
      if(!current.catalogError){
        const known=new Map(cache.catalog.map(item=>[item.asin,item]))
        let queued=0
        for(const asin of asins){
          if(queued>=10)break
          if(Date.now()-(current.catalogChecked[asin]??0)<(known.get(asin)?.imageUrl?7*86400000:60000))continue
          enqueue('catalog',asin,{asin});queued++
        }
      }
    })
  }
  try {
    await acquireWakeLock()
    await updateMeta(account, state => { if (state.leaseOwner && (state.leaseUntil ?? 0) > Date.now()) throw new Error('Another tab is syncing this account. Stop that sync or wait two minutes after closing the tab.'); state.leaseOwner = owner; state.leaseUntil = Date.now() + 120000 })
    heartbeat = setInterval(() => { void checkedUpdate(state => { state.leaseUntil = Date.now() + 120000 }).catch(() => abort.abort()) }, 20000)
    await checkedUpdate(state => {
      // Later changes must be found even when the selected purchases are months old.
      const recentStart = new Date(Math.max(0, requestCutoff - 3 * 86400000)).toISOString()
      const recentEnd = new Date(requestCutoff).toISOString()
      const existingRecentFinance = state.jobs.find(job => job.kind === 'finance' && job.to >= new Date(requestCutoff - 24 * 3600000).toISOString())
      if (existingRecentFinance) {
        existingRecentFinance.scope = scope
        if (Date.parse(existingRecentFinance.to) < Date.parse(recentEnd) - 60000) {
          appendJob(state, makeJob('finance', { from: existingRecentFinance.to, to: recentEnd }))
        }
      } else {
        appendJob(state, makeJob('finance', { from: recentStart, to: recentEnd }))
      }
      // One resumable recent-order stream across scopes. Never restart its pagination for each new clock cutoff.
      const pendingRecent=state.jobs.find(job=>job.lane==='recent')
      if(pendingRecent){pendingRecent.lane='recent';pendingRecent.scope=scope}
      else {
        const previous=Date.parse(state.recentOrdersThrough??'')
        const latestStart=Math.max(Number.isFinite(previous)?previous-15*60000:ordersCutoff-3600000,ordersCutoff-3600000)
        const from=new Date(latestStart).toISOString()
        const catchupStart=Number.isFinite(previous)?previous-15*60000:ordersCutoff-3*86400000
        if(catchupStart<latestStart)appendJob(state,makeJob('purchases',{from:new Date(Math.max(0,catchupStart)).toISOString(),to:from},{updatedOnly:true}))
        appendJob(state,makeJob('purchases',{from,to:new Date(ordersCutoff).toISOString()},{updatedOnly:true,lane:'recent'}))
      }
      state.catalogError = null
      state.jobs = state.jobs.filter(job => job.kind === 'finance' || job.kind === 'purchases' || job.kind === 'catalog' || job.kind === 'orderItems' || job.kind === 'order' || job.kind === 'history')
      for (const job of state.jobs) if (job.scope === scope && Date.now() - job.createdAt > 23 * 3600000) { job.nextToken = null; job.createdAt = Date.now() }
      for (const kind of ['purchases', 'finance'] as const) {
        const coverage = kind === 'purchases' ? state.purchaseCoverage : state.coverage
        const pending = state.jobs.filter(job => job.scope === scope && job.kind === kind)
        const gaps = missingRanges(wanted, [...coverage, ...pending])
        for (const range of gaps) appendJob(state, makeJob(kind, range))
        const recentFrom = new Date(Math.max(start, stop - 3 * 86400000)).toISOString()
        if (kind === 'purchases') {
          // Creation-date gaps above still backfill history. Current changes use the single recent stream.
          if(!androidDevice && !state.recentOrdersThrough)appendJob(state, makeJob('purchases', { from: recentFrom, to: wanted.to }))
        } else if (options?.forceRecent || (coverage.length && !pending.length && !gaps.length)) {
          appendJob(state, makeJob(kind, { from: recentFrom, to: wanted.to }))
        }
      }
    })
    const next: Record<string, number> = { ...(await meta(account)).nextAllowed }
    const delays: Record<string, number> = { finance: 2000, purchases: 60000, order: 2000, orderItems: 2000, catalog: 2000 }
    let totalPlanned = 0, completedCount = 0, metadataCount = -1, metadataVersion = -1
    while (!abort.signal.aborted && Date.now()<deadline) {
      const urgentRecent=(await meta(account)).jobs.some(job=>job.lane==='recent'&&job.scope===scope)
      if(!urgentRecent&&(metadataVersion!==detailRequestVersion || completedCount-metadataCount>=4)){await queueMetadata();metadataCount=completedCount;metadataVersion=detailRequestVersion}
      const state = await meta(account)
      const jobs = state.jobs.filter(job => job.scope === scope)
      if (!jobs.length) {
        const cache = await loadCache(account), known = new Map(cache.orders.map(order => [order.id, order])), references = new Set<string>()
        for (const record of cache.records) {
          for (const related of (Array.isArray(record.relatedIdentifiers) ? record.relatedIdentifiers : []).map(object)) if (related.relatedIdentifierName === 'ORDER_ID') references.add(text(related.relatedIdentifierValue))
        }

        await checkedUpdate(current => {
          for (const id of references) if (id && !/^[A-Z0-9]{3}-\d{7}-\d{7}$/.test(id)) {
            const issue = `Unsupported order reference: ${id}. Its raw financial activity is retained for review.`
            if (!current.issues.includes(issue)) { current.issues.push(issue); current.orderDateIssues++ }
          }
          // 1. Essential work: Missing order references (order dates for financial records)
          const missingIds = [...references].filter(id =>
            id && /^[A-Z0-9]{3}-\d{7}-\d{7}$/.test(id)
            && !known.has(id)
            && tracker.canEnqueue('order', id)
            && Date.now() - (current.dateFailures[id] ?? 0) > 6 * 3600000
          ).slice(0, 10)
          for (const id of missingIds) {
            tracker.recordEnqueued('order', id)
            appendJob(current, makeJob('order', wanted, { orderId: id }))
          }

          // 1. Essential work: Linked order history (orders in requested window without continuous financial coverage)
          const continuousHigh = current.coverage.map(c => c.to).sort().at(-1)
          const isCovered = (purchased: string) => continuousHigh && purchased <= continuousHigh && !missingRanges({ from: purchased, to: continuousHigh }, current.coverage).length
          const dueHistoryOrders = cache.orders.filter(order =>
            order.purchased >= wanted.from && order.purchased <= wanted.to
            && !isCovered(order.purchased)
            && tracker.canEnqueue('history', order.id)
            && (options?.forceHistory || Date.now() - (current.historyChecked[order.id] ?? 0) > 6 * 3600000)
          ).slice(0, 10)
          for (const order of dueHistoryOrders) {
            tracker.recordEnqueued('history', order.id)
            appendJob(current, makeJob('history', wanted, { orderId: order.id }))
          }


        })
        await queueMetadata()
        if (!(await meta(account)).jobs.some(job => job.scope === scope)) break
        continue
      }
      totalPlanned = Math.max(totalPlanned, completedCount + jobs.length)
      const percent = totalPlanned > 0 ? Math.max(5, Math.min(100, Math.round((completedCount / totalPlanned) * 100))) : 100
      jobs.sort((a, b) => {
        const pauseDiff = (next[bucket(a)] ?? 0) - (next[bucket(b)] ?? 0)
        if (pauseDiff !== 0) return pauseDiff
        const dateDiff = (b.to || '').localeCompare(a.to || '')
        if (dateDiff !== 0) return dateDiff
        const order = { finance: 0, purchases: 1, history: 2, order: 3, orderItems: 4, catalog: 5 }
        if (a.kind !== b.kind) return (order[a.kind] ?? 9) - (order[b.kind] ?? 9)
        return a.id.localeCompare(b.id)
      })
      const job = pickSyncJob(jobs,next,completedCount,detailPriority,Date.now()), operation = bucket(job), pause = (next[operation] ?? 0) - Date.now()
      if (pause > 0) {
        const seconds = Math.ceil(pause / 1000)
        publish({ progress: `Waiting for Amazon allowance (${seconds}s) · ${jobs.length} check${jobs.length === 1 ? '' : 's'} remaining (${percent}%)`, percent })
        await wait(Math.min(pause, 1000), abort.signal); continue
      }
      const isEnrichment = job.kind === 'orderItems' || job.kind === 'catalog'
      const phasePrefix = isEnrichment ? 'Enriching product details' : 'Financial sync'
      const kindLabel = job.kind === 'purchases' ? 'orders' : job.kind === 'finance' ? 'financial activity' : job.kind === 'history' ? 'linked order history' : job.kind === 'catalog' ? 'product images' : job.kind === 'orderItems' ? 'product line items' : 'order dates'
      publish({ progress: `${phasePrefix}: fetching ${kindLabel} (${completedCount + 1}/${totalPlanned})`, percent })
      const opDelay = job.kind === 'purchases' ? (job.nextToken ? 3000 : 60000) : (delays[operation] ?? 2000)
      next[operation] = Date.now() + opDelay
      await checkedUpdate(current => { current.nextAllowed[operation] = next[operation] })
      let retried = 0, succeeded = false
      while (!succeeded && !abort.signal.aborted && Date.now()<deadline) {
        try {
          const action = job.kind === 'history' ? 'finance' : job.kind
          const page = await authorized(action, { from: job.from, to: job.to, orderId: job.orderId, asin: job.asin, updatedOnly: job.updatedOnly, nextToken: job.nextToken }, abort.signal)
          if (abort.signal.aborted) break
          const nextToken = text(page.nextToken) || null
          if (nextToken && nextToken === job.nextToken) throw new Error('Amazon repeated a page token. Resume the saved checkpoint later.')
          if ((job.kind === 'finance' || job.kind === 'history') && !Array.isArray(page.records)) throw new Error('Unsupported financial page; the checkpoint was not advanced.')
          if (job.kind === 'purchases' && !Array.isArray(page.orders)) throw new Error('Unsupported orders page; the checkpoint was not advanced.')
          if (job.kind === 'orderItems' && !Array.isArray(page.items)) throw new Error('Unsupported orderItems page; the checkpoint was not advanced.')
          const orders = job.kind === 'order' ? [orderSummary(page)] : job.kind === 'purchases' ? (page.orders as unknown[]).map(orderSummary) : undefined
          const orderItems = job.kind === 'orderItems' && Array.isArray(page.items)
            ? (page.items as unknown[]).map(object).map(item => ({
                asin: text(item.asin) || null,
                sku: text(item.sku) || null,
                title: text(item.title) || null,
                quantity: Number(item.quantity) || 1,
                price: text(item.price) || null,
                currency: text(item.currency) || null,
              }))
            : undefined
          const issues = Array.isArray(page.issues) ? page.issues.map(value => { const issue = object(value); return `${text(issue.reason)} Source evidence: ${text(issue.raw)}` }) : []
          await commitPage(account, owner, job, {
            records: Array.isArray(page.records) ? page.records.map(object) : undefined,
            orders,
            issues,
            nextToken,
            catalog: job.kind === 'catalog' ? page as unknown as CatalogValue : undefined,
            orderItems,
          })
          if (job.lane === 'recent' && !nextToken && Date.parse(job.to) < ordersCutoff - 1000) {
            await checkedUpdate(current => {
              appendJob(current, makeJob('purchases', { from: new Date(Math.max(0, Date.parse(job.to) - 15 * 60000)).toISOString(), to: new Date(ordersCutoff).toISOString() }, { updatedOnly: true, lane: 'recent' }))
            })
          }
          if (job.kind === 'orderItems' && job.orderId) tracker.recordCompleted('orderItems', job.orderId)
          if (job.kind === 'catalog' && job.asin) tracker.recordCompleted('catalog', job.asin)
          if (job.kind === 'history' && job.orderId) tracker.recordCompleted('history', job.orderId)
          if (job.kind === 'order' && job.orderId) tracker.recordCompleted('order', job.orderId)
          completedCount++
          succeeded = true
          await refreshView()
        } catch (cause) {
          if (abort.signal.aborted) break
          if (cause instanceof RelayError && (cause.status === 401 || cause.status === 403) && job.kind !== 'catalog') throw cause
          if (cause instanceof RelayError && cause.status === 429) {
            next[operation] = Date.now() + Math.max(cause.retryAfter, 5) * 1000
            await checkedUpdate(current => { current.nextAllowed[operation] = next[operation] })
            break
          }
          if (cause instanceof RelayError && job.kind === 'catalog') {
            await checkedUpdate(current => {
              current.catalogError = cause.message
              current.jobs = current.jobs.filter(value => value.kind !== 'catalog')
            })
            if (job.asin) tracker.recordFailed('catalog', job.asin, cause.message)
            await refreshView()
            succeeded = true
            break
          }
          if (cause instanceof RelayError && (job.kind === 'order' || job.kind === 'orderItems') && [400, 404, 422].includes(cause.status)) {
            await checkedUpdate(current => {
              if (job.kind === 'orderItems' && job.orderId) {
                current.orderItemsChecked = current.orderItemsChecked || {}
                current.orderItemsChecked[job.orderId] = Date.now()
                tracker.recordFailed('orderItems', job.orderId, cause.message)
              } else if (job.orderId) {
                current.dateFailures[job.orderId] = Date.now()
                const issue = `${job.orderId}: ${cause.message}`
                if (!current.issues.includes(issue)) { current.issues.push(issue); current.orderDateIssues++ }
                tracker.recordFailed('order', job.orderId, cause.message)
              }
              current.jobs = current.jobs.filter(value => value.id !== job.id)
            })
            await refreshView()
            succeeded = true
            break
          }
          const isTransient = !(cause instanceof RelayError && [400, 401, 403].includes(cause.status))
          if (isTransient && retried < 3) {
            retried++
            const backoff = retried * 3000
            publish({ progress: `Connection blip; retrying in ${backoff / 1000}s (attempt ${retried}/3)… (${percent}%)`, percent })
            await wait(backoff, abort.signal)
            continue
          }
          const issueMsg = `Window ${job.from.slice(0,10)} to ${job.to.slice(0,10)} (${job.kind}): ${cause instanceof Error?cause.message:'Temporarily unavailable'}`
          await checkedUpdate(current=>{
            if(!current.issues.includes(issueMsg))current.issues.push(issueMsg)
            const queued=current.jobs.find(value=>value.id===job.id);if(queued){queued.state='retryLater';queued.failureReason=issueMsg}
            current.nextAllowed[operation]=Date.now()+60000
          })
          throw cause
        }
      }
    }
    if (!androidDevice && !abort.signal.aborted) {
      try {
        const stock=(await inventoryStorage.get<InventoryState>(`inventory:${account}`)).value
        if (!stock || Object.values(stock.sources).some(value=>Date.parse(value!.nextAttempt)<=Date.now())) await syncInventory(account,await snapshot(account),inventoryStorage,(job,signal)=>authorized('inventory',{...job},AbortSignal.any([signal,abort.signal])),Boolean(options?.forceHistory))
      } catch { /* Optional inventory cannot fail financial sync. */ }
    }
    const finalState = await meta(account)
    if(!androidDevice&&!abort.signal.aborted)try{
      const reviewSource=await snapshot(account)
      await runReviewCycle(inventoryStorage,{account,orders:reviewOrders(reviewSource.orders??[]),freshOrdersAt:(await meta(account)).recentOrdersCheckedAt??null},{
        order:async(id,signal)=>await authorized('reviewOrder',{orderId:id},signal) as unknown as ReviewOrder,
        eligible:async(id,signal)=>(await authorized('reviewEligibility',{orderId:id},signal)).eligible===true,
        submit:async(id,attemptId,signal)=>{const result=await authorized('reviewSubmit',{orderId:id,attemptId},signal,false);if(result.accepted!==true)throw new Error('Amazon did not confirm review submission.')},
      })
    }catch{/* Optional reviews never fail financial sync; automatic sending starts off. */}
    const finalIssues = finalState.issues.length
    const remainingScopeJobs = finalState.jobs.filter(job => job.scope === scope)
    const recentPending = finalState.jobs.some(job => job.lane === 'recent')
    const recentOrdersCaughtUp = Boolean(finalState.recentOrdersThrough && Date.parse(finalState.recentOrdersThrough) >= ordersCutoff - 1000 && !recentPending)
    const workPending = remainingScopeJobs.length > 0 || recentPending

    let doneProgress: string
    let finalPercent = 100
    if (abort.signal.aborted) {
      doneProgress = androidDevice && abort.signal.reason === 'background'
        ? 'Android continues fetching. Foreground sync resumes automatically on return.'
        : 'Sync stopped. Completed pages are saved; press Sync now to resume.'
      finalPercent = totalPlanned > 0 ? Math.min(99, Math.max(5, Math.round((completedCount / totalPlanned) * 100))) : 95
    } else if (workPending) {
      finalPercent = totalPlanned > 0 ? Math.min(95, Math.max(5, Math.round((completedCount / totalPlanned) * 100))) : 90
      doneProgress = recentOrdersCaughtUp
        ? 'Recent orders are up to date. Remaining history continues automatically.'
        : 'Sync reached time budget. Saved progress will resume automatically.'
    } else if (finalIssues > 0) {
      doneProgress = `Sync completed with ${finalIssues} item note${finalIssues === 1 ? '' : 's'}. Cached data is saved.`
    } else {
      doneProgress = options?.silent
        ? 'Synced with Amazon just now.'
        : 'Requested sync complete. Up to date with Amazon.'
    }
    publish({ progress: doneProgress, percent: finalPercent })
  } catch (cause) { if (!abort.signal.aborted) { if (cause instanceof RelayError && cause.status === 401) { session = null; try { localStorage.removeItem(STORAGE_CREDS_KEY) } catch {}; publish({ connected: false, error: 'Amazon credentials expired or were revoked. Reconnect to continue.' }) } else { publish({ error: cause instanceof Error ? cause.message : 'Sync failed. Saved pages remain available.' }) } } }
  finally {
    releaseWakeLock()
    if (heartbeat) clearInterval(heartbeat)
    await updateMeta(account, state => { if (state.leaseOwner === owner) { state.leaseOwner = null; state.leaseUntil = 0 } }).catch(() => {})
    if (run === abort) run = null
    publish({ busy: false, percent: undefined }); await refreshView().catch(() => {})
    if (androidDevice && resumeAfterHandoff && document.visibilityState === 'visible') setTimeout(() => { void resumeAndroid() }, 500)
  }
}
export async function clearAndResyncHosted(range?:{from:string;to:string}) {
  await initializeHosted();if(!view.account||run)return
  const today=getIndiaToday(),days=range??{from:toIndiaDateString(Date.now()-86400000)??today,to:today}
  // Explicit recovery rechecks source activity; it never clears durable seller records.
  await syncHosted(days,{forceRecent:true,forceHistory:true})
}

export async function hostedFetch(input: string, init?: RequestInit): Promise<Response> {
  await initializeHosted()
  if (input.startsWith('/api/report-sync/range')) {
    if (init?.body && typeof init.body === 'string' && session && view.account && !run) {
      try {
        const body = JSON.parse(init.body)
        if (body.from && body.to) {
          const from = toIndiaDateString(body.from) ?? String(body.from).slice(0, 10)
          const to = toIndiaDateString(body.to) ?? String(body.to).slice(0, 10)
          setTimeout(() => {
            if (!run && session && view.account) void syncHosted({ from, to }, { silent: true })
          }, 400)
        }
      } catch {}
    }
    return Response.json({ queued: true, onDemand: false })
  }
  await refreshView()
  if (input.startsWith('/api/report-sync/status')) {
    const state = view.state
    const status: SyncStatus = {
      onDemand: false,
      connectionKey: view.account ?? '',
      configured: Boolean(view.account),
      revision: state?.revision ?? 0,
      records: view.records,
      missingWindows: state?.jobs.filter(job => job.kind === 'finance' || job.kind === 'purchases').length ?? 0,
      coverage: state?.coverage ?? [],
      purchaseCoverage: state?.purchaseCoverage ?? [],
      state: view.busy ? 'syncing' : view.error ? 'error' : 'idle',
      lastSync: state?.lastSync ?? null,
      nextAttempt: null,
      error: view.error || null,
      catalogError: state?.catalogError,
      orderDateIssues: state?.orderDateIssues,
      pendingOrderCycles: state?.jobs.filter(job => job.kind === 'history').length,
      pendingOrderDates: state?.jobs.filter(job => job.kind === 'order').length,
    }
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

export async function hostedReviewAction(account:string,action:string,payload:Record<string,unknown>,signal:AbortSignal){await initializeHosted();if(session?.account!==account)throw new Error('Seller account changed. Reopen this order.');return authorized(action,payload,signal)}
