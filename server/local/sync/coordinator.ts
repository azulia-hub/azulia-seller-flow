import { createCatalogReader } from './catalog.ts'
import { createActivityReader, SourceError } from './reader.ts'
import { createOrderDateReader, parseOrderDate } from './orders.ts'
import { openSyncStore } from './store.ts'
import { missingRanges, mergeCoverage, type SyncRange } from '../../../src/core/sync/ranges.ts'
import type { SyncStatus, SyncSnapshot } from '../../../src/adapters/amazon-report-sync/protocol.ts'
import type { PilotCredentials } from '../../amazon/pilot.ts'
import { object, text } from '../../../src/adapters/amazon-report-sync/money.ts'
export async function createReportSync(options: { directory: string; connectionKey: string; credentials: PilotCredentials; request?: typeof fetch }) {
  const store = await openSyncStore(options.directory, options.connectionKey), read = createActivityReader(options.credentials, options.request)
  const orderReader = createOrderDateReader(options.credentials, options.request)
  for (const issue of store.orderDateIssueRecords()) {
    try { const order = parseOrderDate(object(JSON.parse(issue.raw))); store.saveOrderDate(order.id, order.purchased, order.summary) } catch { /* Unsupported evidence remains visible for review. */ }
  }
  const readCatalog = createCatalogReader(options.credentials, options.request)
  let catalogRunning = false, catalogNext = 0, catalogError: string | null = null
  const abort = new AbortController()
  let refreshInterval=3*60000
  let running = false, stopped = false, state: SyncStatus['state'] = 'idle', error: string | null = store.get('error'), nextAttempt = Number(store.get('nextAttempt') ?? 0)
  let ordersRunning = false, ordersNext = 0, listNext = Number(store.get('orderListNext') ?? 0), orderError: string | null = store.get('orderError')
  if (error === 'Amazon authorization failed. Check the local credentials.') nextAttempt = 0
  const today = () => Date.parse(new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)) - 330 * 60000
  const defaultRange = (): SyncRange => ({ from: new Date(today() - 29 * 86400000).toISOString(), to: new Date(Math.floor((Date.now() - 5 * 60000) / 60000) * 60000).toISOString() })
  const requested = (): SyncRange[] => JSON.parse(store.get('requested') ?? '[]') as SyncRange[]
  if (!requested().length) store.set('requested', JSON.stringify([defaultRange()]))
  function want(range: SyncRange) {
    const from = Date.parse(range.from), to = Math.min(Date.parse(range.to), Date.now() - 5 * 60000)
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to || from < Date.UTC(2010, 0, 1) || to - from > 5 * 366 * 86400000) throw new Error('Choose a valid date range of at most five years. Amazon history availability still applies.')
    const normalized = { from: new Date(from).toISOString(), to: new Date(to).toISOString() }
    const old = requested()
    // Keep user history requests, without adding a new entry on every repeated visit.
    if (missingRanges(normalized, old).length) store.set('requested', JSON.stringify(mergeCoverage([...old, normalized])))
    nextAttempt = 0
    void tick()
    void tickOrders()
  }
  async function tickCatalog() {
    if (catalogRunning || stopped || Date.now() < catalogNext) return
    const pending = store.pendingCatalog(); if (!pending) return
    catalogRunning = true
    try { store.saveCatalog(await readCatalog(pending.asin, abort.signal)); catalogError = null; catalogNext = Date.now() + 3000 }
    catch (cause) {
      if (!stopped) { catalogError = cause instanceof Error ? cause.message : 'Product images could not be updated.'; catalogNext = Date.now() + (cause instanceof SourceError ? cause.retryAfter : 60) * 1000; if (cause instanceof SourceError && [400,404].includes(cause.status))  { store.deferCatalog(pending.asin); catalogNext = Date.now() + 3000 } }
    } finally { catalogRunning = false }
  }
  async function tickOrders() {
    if (ordersRunning || stopped || Date.now() < ordersNext) return
    ordersRunning = true
    let lookupId: string | null = null
    try {
      const now = Date.now(), purchaseCoverage = JSON.parse(store.get('purchaseCoverage') ?? '[]') as SyncRange[]
      let job = store.jobs().find(job => job.kind === 'purchases')
      if (!job && now >= listNext) {
        const gap = [...requested(), defaultRange()].flatMap(range => missingRanges(range, purchaseCoverage)).sort((a, b) => b.to.localeCompare(a.to))[0]
        if (gap) store.enqueue('purchases', gap)
        else if (now - Number(store.get('lastPurchaseRefresh') ?? 0) > refreshInterval) {
          const range = defaultRange()
          store.enqueue('purchases', { from: new Date(Math.max(Date.parse(range.from), now - 3 * 86400000)).toISOString(), to: range.to })
          store.set('lastPurchaseRefresh', String(now))
        }
        job = store.jobs().find(job => job.kind === 'purchases')
      }
      if (job && now >= listNext) {
        // Orders list allowance is independent of single-order and Finance allowances.
        listNext = now + 60000; store.set('orderListNext', String(listNext))
        if (now - job.createdAt > 23 * 3600000) store.discardJob(job.id)
        else { const page = await orderReader.page(job, abort.signal); store.commitOrderPage(job, page.orders, page.nextToken, page.issues);if(!page.nextToken&&Date.parse(job.to)>=Date.now()-15*60000)store.set('lastOrdersScanAt',new Date().toISOString()) }
      } else {
        const missingItems = store.missingOrderItems()
        if (missingItems) {
          lookupId = missingItems.id
          try {
            let nextToken: string | null = null
            const allItems: { asin: string | null; sku: string | null; title: string | null; quantity: number; price?: string | null; currency?: string | null }[] = []
            do {
              const page = await orderReader.items(missingItems.id, abort.signal, nextToken)
              allItems.push(...page.items)
              nextToken = page.nextToken
            } while (nextToken)
            store.saveOrderItems(missingItems.id, allItems)
          } catch (cause) {
            store.deferOrderItems(missingItems.id)
            throw cause
          }
        } else {
          const missingDate = store.missingOrderDates()
          if (missingDate) {
            lookupId = missingDate.id
            const order = await orderReader.one(missingDate.id, abort.signal)
            store.saveOrderDate(order.id, order.purchased, order.summary)
          } else {
            const stale = store.staleOrderSummary()
            if (stale) {
              lookupId = stale.id
              const order = await orderReader.one(stale.id, abort.signal)
              store.saveOrderDate(order.id, order.purchased, order.summary)
            }
          }
        }
      }
      orderError = null; store.set('orderError', ''); ordersNext = Date.now() + 3000
    } catch (cause) {
      if (!stopped) {
        orderError = cause instanceof Error ? cause.message : 'Purchase dates could not be verified.'
        // A single unavailable/invalid historical order must not stall all other dates.
        const isolatedFailure = lookupId && cause instanceof SourceError && [400, 404, 422].includes(cause.status)
        if (isolatedFailure) {
          store.deferOrderDate(lookupId!)
          store.retainOrderDateIssue({ orderId: lookupId!, raw: JSON.stringify({ AmazonOrderId: lookupId, context: 'Financial source reference lookup' }), reason: orderError })
          orderError = null
        }
        // Retry that reference later, but continue other dates at the normal cadence.
        ordersNext = Date.now() + (isolatedFailure ? 3 : cause instanceof SourceError ? cause.retryAfter : 300) * 1000
        store.set('orderError', orderError ?? '')
      }
    } finally { ordersRunning = false }
  }
  async function tick() {
    if (running || stopped || Date.now() < nextAttempt) return
    running = true; state = 'syncing'
    try {
      const now = Date.now(), cutoff = new Date(now - 5 * 60000).toISOString()
      const coverage = store.coverage()
      store.acknowledgeCoveredOrderHistories()
      if (!store.jobs().some(job => job.kind !== 'purchases')) {
        const desired = [...requested(), defaultRange()]
        const gaps = desired.flatMap(range => missingRanges({ from: range.from, to: new Date(Math.min(Date.parse(range.to), Date.parse(cutoff))).toISOString() }, coverage))
        // Recent head first; older backfill follows. Completed windows are never full-downloaded again.
        const gap = gaps.sort((a, b) => b.to.localeCompare(a.to))[0]
        const refreshDue = now - Number(store.get('lastRefresh') ?? 0) >= refreshInterval
        if (coverage.length && refreshDue) {
          const high = coverage.map(range => range.to).sort().at(-1)!
          store.enqueue('refresh', { from: new Date(Math.max(Date.parse(high) - 3 * 86400000, Date.parse(coverage[0].from))).toISOString(), to: cutoff })
          store.set('lastRefresh', String(now))
        } else if (gap) store.enqueue('history', gap)
        else {
          const due = store.unresolvedOrders().find(row => now - row.checked > 6 * 3600000)
          if (due) store.enqueue('order', { from: cutoff, to: cutoff }, due.id)
        }
      }
      const job = store.jobs().find(job => job.kind !== 'purchases')
      if (!job) { state = 'idle'; nextAttempt = Date.now() + 60000; return }
      if (Date.now() - job.createdAt > 23 * 3600000) { store.discardJob(job.id); nextAttempt = Date.now() + 3000; return }
      const result = await read(job, abort.signal)
      try {
        const sellers = [...new Set(result.records.map(record => text(object(record.sellingPartnerMetadata).sellingPartnerId)).filter(Boolean))]
        if (sellers.length > 1 || sellers.length === 1 && store.get('seller') && store.get('seller') !== sellers[0]) throw new Error('Amazon returned a different seller identity; source data was not merged.')
        store.commit(job, result.records, result.nextToken)
        if (!result.nextToken && job.kind === 'history' && Date.parse(job.to) >= Date.now() - 20 * 60000) store.set('lastRefresh', String(Date.now()))
        if (sellers.length === 1) store.set('seller', sellers[0])
      } catch (cause) { store.reject(result.raw); throw cause }
      error = null; store.set('error', ''); state = store.jobs().length ? 'waiting' : 'idle'; nextAttempt = Date.now() + 3000
    } catch (cause) {
      if (!stopped) { error = cause instanceof SourceError ? cause.message : 'Local activity update failed. The previous checkpoint and cached data are retained.'; state = 'error'; nextAttempt = Date.now() + (cause instanceof SourceError ? cause.retryAfter : 300) * 1000; store.set('error', error) }
    } finally { running = false; if (!stopped) store.set('nextAttempt', String(nextAttempt)) }
  }
  const timer = setInterval(() => { void tick(); void tickOrders(); void tickCatalog() }, 3000)
  void tick(); void tickOrders(); void tickCatalog()
  return {
    want,
    configure(minutes:number){refreshInterval=Math.max(2,Math.min(5,minutes))*60000},
    refresh(range?:SyncRange,forceHistory=true){const selected=range??defaultRange();want(selected);const cutoff=new Date(Date.now()-5*60000).toISOString();if(forceHistory)for(const order of store.orders())if(order.purchased>=selected.from&&order.purchased<=selected.to)store.enqueue('history',{from:order.purchased,to:cutoff},order.id);store.set('lastRefresh','0');store.set('lastPurchaseRefresh','0');nextAttempt=0;void tick();void tickOrders()},
    status(): SyncStatus { return { connectionKey: options.connectionKey, configured: true, ordersCheckedAt:store.get('lastOrdersScanAt'), revision: store.revision(), records: store.count(), catalogPending: store.catalogPending(), catalogError, orderDateIssues: store.orderDateIssues(), pendingOrderDates: store.pendingOrderDates(), pendingOrderCycles: store.pendingOrderCycles(), orderDatesSyncing: ordersRunning, orderDatesError: orderError || null, purchaseHistoryPending: mergeCoverage([...requested(), defaultRange()]).flatMap(range => missingRanges(range, JSON.parse(store.get('purchaseCoverage') ?? '[]') as SyncRange[])).length, missingWindows: mergeCoverage([...requested(), defaultRange()]).flatMap(range => missingRanges(range, store.coverage())).length, coverage: store.coverage(), purchaseCoverage: JSON.parse(store.get('purchaseCoverage') ?? '[]') as SyncRange[], state, lastSync: store.get('lastSync'), nextAttempt: nextAttempt ? new Date(nextAttempt).toISOString() : null, error } },
    snapshot(since = -1): SyncSnapshot { const delta = Number.isSafeInteger(since) && since >= Number(store.get('deltaBase') ?? 0) && since <= store.revision(); return { ordersCheckedAt:store.get('lastOrdersScanAt'), delta, connectionKey: options.connectionKey, revision: store.revision(), updatedAt: store.get('updatedAt'), orders: store.orders(), purchaseCoverage:JSON.parse(store.get('purchaseCoverage')??'[]') as SyncRange[], records: delta ? store.changesSince(since) : store.records(), coverage: store.coverage() } },
    async close() { stopped = true; clearInterval(timer); abort.abort(); while (running || ordersRunning || catalogRunning) await new Promise(resolve => setTimeout(resolve, 20)); store.close() },
  }
}
export type ReportSync = Awaited<ReturnType<typeof createReportSync>>
