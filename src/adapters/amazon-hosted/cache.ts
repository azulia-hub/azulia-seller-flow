import { empty, type BrowserJob, type CacheMeta, type CatalogValue } from './cacheTypes'
export type { BrowserJob, CacheMeta, CatalogValue } from './cacheTypes'
import { androidDevice, nativeRequest } from '../device/bridge'
import { nativeMeta, nativeUpdateMeta, nativeLoadCache, nativePageTransaction, nativeClearRecent } from '../device/sourceStore'
import { sameContent } from '../../core/sync/sameContent'
import { mergeCoverage } from '../../core/sync/ranges'
import type { SourceOrderSummary, SyncSnapshot } from '../amazon-report-sync/protocol'
import { object, text } from '../amazon-report-sync/money'

interface StoredValue<T> { account: string; id: string; value: T }
let database: Promise<IDBDatabase> | undefined
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
  if (androidDevice) return nativeMeta(account)
  const db = await open(), tx = db.transaction('meta'), done = complete(tx)
  void done.catch(() => {})
  const value = await result(tx.objectStore('meta').get(account)) as CacheMeta | undefined
  await done; return value ?? empty(account)
}
export async function updateMeta(account: string, update: (value: CacheMeta) => void): Promise<CacheMeta> {
  if (androidDevice) return nativeUpdateMeta(account, update)
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite'), store = tx.objectStore('meta'), request = store.get(account)
    let value: CacheMeta, failure: unknown
    request.onsuccess = () => { try { value = request.result ?? empty(account); update(value); store.put(value) } catch (cause) { failure = cause; tx.abort() } }
    tx.oncomplete = () => resolve(value)
    tx.onabort = tx.onerror = () => reject(failure ?? new Error('The browser sync checkpoint could not be saved.'))
  })
}
export async function recordCount(account: string): Promise<number> {
  if(androidDevice)return (await nativeRequest<{count:number}>('source.count',{account})).count
  const db=await open(),tx=db.transaction('records','readonly'),done=complete(tx)
  const count=await result(tx.objectStore('records').index('account').count(account))
  await done; return count
}
export async function loadCache(account: string) {
  if (androidDevice) return nativeLoadCache(account)
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
    const first = order.items?.[0]
    const asin = order.asin || first?.asin || null
    const cat = asin ? catalog.get(asin) : undefined
    return {
      ...order,
      asin,
      sku: order.sku || first?.sku || null,
      title: order.title || first?.title || cat?.title || null,
      imageUrl: order.imageUrl || first?.imageUrl || cat?.imageUrl || null,
      items: order.items?.map(item=>({...item,title:item.title || (item.asin?catalog.get(item.asin)?.title:null) || null,imageUrl:item.imageUrl || (item.asin?catalog.get(item.asin)?.imageUrl:null) || null})),
    }
  })
  return { connectionKey: account, revision: cache.meta.revision, updatedAt: cache.meta.updatedAt, delta: false, records, issues: cache.meta.issues, orders: enrichedOrders, coverage: cache.meta.coverage, purchaseCoverage:cache.meta.purchaseCoverage }
}
export function assertLease(state: CacheMeta, owner: string) { if (state.leaseOwner !== owner || (state.leaseUntil ?? 0) < Date.now()) throw new Error('This sync session lost its browser lock. Resume from the saved checkpoint.') }
export async function clearRecentHostedCache(account: string, cutoffIso?: string) {
  if (androidDevice) return nativeClearRecent(account, cutoffIso)
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

export async function commitPage(account: string, owner: string, job: BrowserJob, page: { backgroundId?: string; records?: Record<string, unknown>[]; orders?: SourceOrderSummary[]; issues?: string[]; nextToken: string | null; catalog?: CatalogValue; orderItems?: { asin?: string | null; sku?: string | null; title?: string | null; quantity?: number; price?: string | null; currency?: string | null }[] }) {
  const native = androidDevice ? await nativePageTransaction(account, job, page) : null
  const db = native ? null : await open(), tx = db?.transaction(['meta', 'records', 'orders', 'catalog', 'history'], 'readwrite')
  const done = tx ? complete(tx) : Promise.resolve()
  // Native persistence uses JSON: absent optional properties must not count as changes
  // merely because an in-memory summary spells them as `undefined`.
  const matches = (previous: unknown, next: unknown) => sameContent(previous, native ? JSON.parse(JSON.stringify(next)) : next)
  const table = (name: 'meta' | 'records' | 'orders' | 'catalog' | 'history') => native ? native.table(name) : {
    get: (key: string | string[]) => result(tx!.objectStore(name).get(key)),
    put: (value: unknown) => { tx!.objectStore(name).put(value) },
    add: (value: unknown) => { tx!.objectStore(name).add(value) },
  }
  // Attach the rejection handler immediately; await the same promise after all writes.
  void done.catch(() => {})
  try {
    const metadata = table('meta'), state = await metadata.get(account) as CacheMeta
    assertLease(state, owner)
    const current = state.jobs.find(value => value.id === job.id)
    if (!current || current.nextToken !== job.nextToken) throw new Error('A newer source page already advanced this browser checkpoint.')
    let changed = false
    for (const record of page.records ?? []) {
      const id = text(record.transactionId)
      if (!id || !Number.isFinite(Date.parse(text(record.postedDate)))) throw new Error('Source transaction identity/date is unsupported. The checkpoint was retained.')
      const store = table('records'), old = await store.get([account, id]) as StoredValue<Record<string, unknown>> | undefined
      if (!old || !matches(old.value, record)) {
        if (old) table('history').add({ account, id, value: old.value, observed: Date.now() })
        store.put({ account, id, value: record }); changed = true
      }
    }
    for (const order of page.orders ?? []) {
      if (!/^[A-Z0-9]{3}-\d{7}-\d{7}$/.test(order.id) || !Number.isFinite(Date.parse(order.purchased))) throw new Error('Unsupported order identity or date. The checkpoint was retained.')
      state.orderChecked[order.id] = Date.now()
      const store = table('orders'), old = await store.get([account, order.id]) as StoredValue<SourceOrderSummary> | undefined
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
      if (!old || !matches(old.value, value)) { store.put({ account, id: order.id, value }); changed = true }
    }
    if (page.orderItems && job.orderId) {
      const store = table('orders'), old = await store.get([account, job.orderId]) as StoredValue<SourceOrderSummary> | undefined
      if (old?.value) {
        const existingItems = Array.isArray(old.value.items) ? old.value.items : []
        const items = job.nextToken ? [...existingItems, ...page.orderItems] : page.orderItems
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
        if (!matches(old.value, value)) {
          store.put({ account, id: job.orderId, value })
          changed = true
        }
      }
      state.orderItemsChecked = state.orderItemsChecked || {}
      state.orderItemsChecked[job.orderId] = Date.now()
    }
    if (page.catalog) {
      const item = page.catalog, store = table('catalog'), old = await store.get([account, item.asin]) as StoredValue<CatalogValue> | undefined
      if (!old || !matches(old.value, item)) { store.put({ account, id: item.asin, value: item }); changed = true }
      state.catalogChecked[item.asin] = Date.now()
    }
    if (page.issues?.length) { const before = state.issues.length; state.issues = [...new Set([...state.issues, ...page.issues])]; state.orderDateIssues += state.issues.length - before }
    if (page.nextToken) {
      current.nextToken = page.nextToken
      current.state = 'running'
    } else {
      current.state = 'completed'
      state.jobs = state.jobs.filter(value => value.id !== job.id)
      if (job.kind === 'finance') state.coverage = mergeCoverage([...state.coverage, { from: job.from, to: job.to }])
      if (job.kind === 'purchases' && !job.updatedOnly) state.purchaseCoverage = mergeCoverage([...state.purchaseCoverage, { from: job.from, to: job.to }])
      if (job.kind === 'history' && job.orderId) state.historyChecked[job.orderId] = Date.now()
      if (job.kind === 'orderItems' && job.orderId) {
        state.orderItemsChecked = state.orderItemsChecked || {}
        state.orderItemsChecked[job.orderId] = Date.now()
      }
    }
    if (changed || state.revision === 0 && !page.nextToken) { state.revision++; state.updatedAt = new Date().toISOString() }
    state.lastSync = new Date().toISOString(); state.leaseUntil = Date.now() + 120000
    metadata.put(state)
    if (native) await native.commit()
    await done
  } catch (cause) { native?.abort(); try { tx?.abort() } catch { /* A failed transaction already aborted. */ } await done.catch(() => {}); throw cause }
}
