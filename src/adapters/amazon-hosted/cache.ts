import { sameContent } from '../../core/sync/sameContent'
import { mergeCoverage, type SyncRange } from '../../core/sync/ranges'
import type { SourceOrderSummary, SyncSnapshot } from '../amazon-report-sync/protocol'
import { object, text } from '../amazon-report-sync/money'

export interface BrowserJob extends SyncRange { id: string; scope: string; kind: 'finance' | 'purchases' | 'order' | 'history' | 'catalog' | 'orderItems'; orderId?: string; asin?: string; nextToken: string | null; createdAt: number }
export interface CacheMeta {
  account: string; revision: number; updatedAt: string | null; lastSync: string | null
  coverage: SyncRange[]; purchaseCoverage: SyncRange[]; jobs: BrowserJob[]
  orderChecked: Record<string, number>; historyChecked: Record<string, number>; nextAllowed: Record<string, number>; dateFailures: Record<string, number>; catalogChecked: Record<string, number>; orderItemsChecked?: Record<string, number>
  issues: string[]; orderDateIssues: number; catalogError: string | null
  leaseOwner?: string | null; leaseUntil?: number
}
interface StoredValue<T> { account: string; id: string; value: T }
export interface CatalogValue { asin: string; title: string | null; imageUrl: string | null }
let database: Promise<IDBDatabase> | undefined
const empty = (account: string): CacheMeta => ({ account, revision: 0, updatedAt: null, lastSync: null, coverage: [], purchaseCoverage: [], jobs: [], orderChecked: {}, historyChecked: {}, nextAllowed: {}, dateFailures: {}, catalogChecked: {}, orderItemsChecked: {}, issues: [], orderDateIssues: 0, catalogError: null })
function open() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('azulia-amazon-browser-source', 1)
    request.onupgradeneeded = () => {
      const db = request.result
      db.createObjectStore('meta', { keyPath: 'account' })
      for (const name of ['records', 'orders', 'catalog']) db.createObjectStore(name, { keyPath: ['account', 'id'] }).createIndex('account', 'account')
      db.createObjectStore('history', { autoIncrement: true }).createIndex('account', 'account')
    }
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database = undefined }; resolve(request.result) }
    request.onerror = () => { database = undefined; reject(new Error('Browser source storage is unavailable. Allow website storage and retry.')) }
    request.onblocked = () => { database = undefined; reject(new Error('Close other Azulia tabs to open the browser source cache.')) }
  })
}
function result<T>(request: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error('Browser source storage could not be read or written.')) }) }
function complete(transaction: IDBTransaction) { return new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = transaction.onerror = () => reject(new Error('Browser source storage could not be saved. Previous checkpoints were retained.')) }) }
export async function meta(account: string): Promise<CacheMeta> {
  const db = await open(), tx = db.transaction('meta'), done = complete(tx)
  void done.catch(() => {})
  const value = await result(tx.objectStore('meta').get(account)) as CacheMeta | undefined
  await done; return value ?? empty(account)
}
export async function updateMeta(account: string, update: (value: CacheMeta) => void): Promise<CacheMeta> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite'), store = tx.objectStore('meta'), request = store.get(account)
    let value: CacheMeta, failure: unknown
    request.onsuccess = () => { try { value = request.result ?? empty(account); update(value); store.put(value) } catch (cause) { failure = cause; tx.abort() } }
    tx.oncomplete = () => resolve(value)
    tx.onabort = tx.onerror = () => reject(failure ?? new Error('The browser sync checkpoint could not be saved.'))
  })
}
export async function loadCache(account: string) {
  const db = await open(), tx = db.transaction(['meta', 'records', 'orders', 'catalog']), done = complete(tx)
  void done.catch(() => {})
  const [state, records, orders, catalog] = await Promise.all([
    result(tx.objectStore('meta').get(account)), result(tx.objectStore('records').index('account').getAll(account)),
    result(tx.objectStore('orders').index('account').getAll(account)), result(tx.objectStore('catalog').index('account').getAll(account)),
  ]) as [CacheMeta | undefined, StoredValue<Record<string, unknown>>[], StoredValue<SourceOrderSummary>[], StoredValue<CatalogValue>[]]
  await done
  return { meta: state ?? empty(account), records: records.map(row => row.value), orders: orders.map(row => row.value), catalog: catalog.map(row => row.value) }
}
export async function snapshot(account: string): Promise<SyncSnapshot> {
  const cache = await loadCache(account), orders = new Map(cache.orders.map(order => [order.id, order])), catalog = new Map(cache.catalog.map(item => [item.asin, item]))
  const records = cache.records.map((record): Record<string, unknown> => {
    const ids = [...new Set((Array.isArray(record.relatedIdentifiers) ? record.relatedIdentifiers : []).map(object).filter(row => row.relatedIdentifierName === 'ORDER_ID').map(row => text(row.relatedIdentifierValue)).filter(Boolean))]
    const asins = [...new Set((Array.isArray(record.items) ? record.items : []).map(object).flatMap(item => (Array.isArray(item.contexts) ? item.contexts : []).map(object).map(context => text(context.asin))).filter(Boolean))]
    return { ...record, azuliaOrderPurchaseDate: ids.length === 1 ? orders.get(ids[0])?.purchased ?? null : null, azuliaCatalogImages: Object.fromEntries(asins.map(asin => [asin, catalog.get(asin)?.imageUrl ?? null])), azuliaCatalogTitles: Object.fromEntries(asins.map(asin => [asin, catalog.get(asin)?.title ?? null])) }
  }).sort((a, b) => text(a.postedDate).localeCompare(text(b.postedDate)) || text(a.transactionId).localeCompare(text(b.transactionId)))
  const enrichedOrders = cache.orders.map(order => {
    const cat = order.asin ? catalog.get(order.asin) : undefined
    return {
      ...order,
      title: order.title || cat?.title || null,
      imageUrl: order.imageUrl || cat?.imageUrl || null,
    }
  })
  return { connectionKey: account, revision: cache.meta.revision, updatedAt: cache.meta.updatedAt, delta: false, records, issues: cache.meta.issues, orders: enrichedOrders, coverage: cache.meta.coverage }
}
export function assertLease(state: CacheMeta, owner: string) { if (state.leaseOwner !== owner || (state.leaseUntil ?? 0) < Date.now()) throw new Error('This sync session lost its browser lock. Resume from the saved checkpoint.') }
export async function clearRecentHostedCache(account: string, cutoffIso?: string) {
  const db = await open(), tx = db.transaction(['meta', 'orders', 'records'], 'readwrite'), done = complete(tx)
  void done.catch(() => {})
  try {
    const cutoff = cutoffIso ?? new Date(Date.now() - 48 * 3600000).toISOString()
    const metadata = tx.objectStore('meta'), state = ((await result(metadata.get(account))) as CacheMeta) ?? empty(account)
    const orderStore = tx.objectStore('orders')
    const allOrders = ((await result(orderStore.index('account').getAll(account))) as StoredValue<SourceOrderSummary>[]) || []
    for (const row of allOrders) {
      if (row.value?.purchased && row.value.purchased >= cutoff) {
        orderStore.delete([account, row.id])
      }
    }
    state.purchaseCoverage = state.purchaseCoverage.filter(c => c.to < cutoff)
    state.coverage = state.coverage.filter(c => c.to < cutoff)
    state.jobs = state.jobs.filter(job => job.to < cutoff)
    state.revision++
    state.updatedAt = new Date().toISOString()
    metadata.put(state)
    await done
  } catch (cause) {
    try { tx.abort() } catch { /* Aborted */ }
    await done.catch(() => {})
    throw cause
  }
}

export async function commitPage(account: string, owner: string, job: BrowserJob, page: { records?: Record<string, unknown>[]; orders?: SourceOrderSummary[]; issues?: string[]; nextToken: string | null; catalog?: CatalogValue; orderItems?: { asin?: string | null; sku?: string | null; title?: string | null; quantity?: number; price?: string | null; currency?: string | null }[] }) {
  const db = await open(), tx = db.transaction(['meta', 'records', 'orders', 'catalog', 'history'], 'readwrite'), done = complete(tx)
  // Attach the rejection handler immediately; await the same promise after all writes.
  void done.catch(() => {})
  try {
    const metadata = tx.objectStore('meta'), state = await result(metadata.get(account)) as CacheMeta
    assertLease(state, owner)
    const current = state.jobs.find(value => value.id === job.id)
    if (!current || current.nextToken !== job.nextToken) throw new Error('A newer source page already advanced this browser checkpoint.')
    let changed = false
    for (const record of page.records ?? []) {
      const id = text(record.transactionId)
      if (!id || !Number.isFinite(Date.parse(text(record.postedDate)))) throw new Error('Source transaction identity/date is unsupported. The checkpoint was retained.')
      const store = tx.objectStore('records'), old = await result(store.get([account, id])) as StoredValue<Record<string, unknown>> | undefined
      if (!old || !sameContent(old.value, record)) {
        if (old) tx.objectStore('history').add({ account, id, value: old.value, observed: Date.now() })
        store.put({ account, id, value: record }); changed = true
      }
    }
    for (const order of page.orders ?? []) {
      if (!/^[A-Z0-9]{3}-\d{7}-\d{7}$/.test(order.id) || !Number.isFinite(Date.parse(order.purchased))) throw new Error('Unsupported order identity or date. The checkpoint was retained.')
      state.orderChecked[order.id] = Date.now()
      const store = tx.objectStore('orders'), old = await result(store.get([account, order.id])) as StoredValue<SourceOrderSummary> | undefined
      const value: SourceOrderSummary = {
        ...old?.value,
        ...order,
        purchased: new Date(order.purchased).toISOString(),
        sku: order.sku ?? old?.value.sku ?? null,
        asin: order.asin ?? old?.value.asin ?? null,
        title: order.title ?? old?.value.title ?? null,
        imageUrl: order.imageUrl ?? old?.value.imageUrl ?? null,
        items: order.items ?? old?.value.items,
      }
      if (!old || !sameContent(old.value, value)) { store.put({ account, id: order.id, value }); changed = true }
    }
    if (page.orderItems && job.orderId) {
      const store = tx.objectStore('orders'), old = await result(store.get([account, job.orderId])) as StoredValue<SourceOrderSummary> | undefined
      if (old?.value) {
        const items = page.orderItems
        const first = items[0]
        const itemsTotal = items.reduce((sum, it) => {
          const p = Number(it.price)
          return Number.isFinite(p) && p > 0 ? sum + p * (it.quantity || 1) : sum
        }, 0)
        const value: SourceOrderSummary = {
          ...old.value,
          sku: first?.sku ?? old.value.sku ?? null,
          asin: first?.asin ?? old.value.asin ?? null,
          title: first?.title ?? old.value.title ?? null,
          orderValue: old.value.orderValue ?? (itemsTotal > 0 ? itemsTotal.toFixed(2) : null),
          currency: old.value.currency ?? (first?.currency ?? null),
          items: items.length ? items : old.value.items,
        }
        if (!sameContent(old.value, value)) {
          store.put({ account, id: job.orderId, value })
          changed = true
        }
      }
      state.orderItemsChecked = state.orderItemsChecked || {}
      state.orderItemsChecked[job.orderId] = Date.now()
    }
    if (page.catalog) {
      const item = page.catalog, store = tx.objectStore('catalog'), old = await result(store.get([account, item.asin])) as StoredValue<CatalogValue> | undefined
      if (!old || !sameContent(old.value, item)) { store.put({ account, id: item.asin, value: item }); changed = true }
      state.catalogChecked[item.asin] = Date.now()
    }
    if (page.issues?.length) { const before = state.issues.length; state.issues = [...new Set([...state.issues, ...page.issues])]; state.orderDateIssues += state.issues.length - before }
    if (page.nextToken) { current.nextToken = page.nextToken }
    else {
      state.jobs = state.jobs.filter(value => value.id !== job.id)
      if (job.kind === 'finance') state.coverage = mergeCoverage([...state.coverage, { from: job.from, to: job.to }])
      if (job.kind === 'purchases') state.purchaseCoverage = mergeCoverage([...state.purchaseCoverage, { from: job.from, to: job.to }])
      if (job.kind === 'history' && job.orderId) state.historyChecked[job.orderId] = Date.now()
      if (job.kind === 'orderItems' && job.orderId) {
        state.orderItemsChecked = state.orderItemsChecked || {}
        state.orderItemsChecked[job.orderId] = Date.now()
      }
    }
    if (changed || state.revision === 0 && !page.nextToken) { state.revision++; state.updatedAt = new Date().toISOString() }
    state.lastSync = new Date().toISOString(); state.leaseUntil = Date.now() + 120000
    metadata.put(state)
    await done
  } catch (cause) { try { tx.abort() } catch { /* A failed transaction already aborted. */ } await done.catch(() => {}); throw cause }
}
