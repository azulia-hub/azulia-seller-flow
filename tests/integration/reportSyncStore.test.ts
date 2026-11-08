import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openSyncStore } from '../../server/local/sync/store'
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
it('commits pagination atomically, upserts by source identity and sorts backfilled records by time', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'azulia-sync-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  const store = await openSyncStore(directory, 'account'); cleanup.push(async () => store.close())
  const range = { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' }
  store.enqueue('history', range)
  const first = store.jobs()[0]
  const record = { transactionId: 'later', postedDate: '2026-10-20T00:00:00Z', transactionStatus: 'DEFERRED' }
  store.commit(first, [record], 'next')
  expect(store.coverage()).toEqual([])
  expect(() => store.commit(first, [record], null)).toThrow('checkpoint')
  store.commit(store.jobs()[0], [{ ...record, transactionStatus: 'RELEASED' }, { transactionId: 'older', postedDate: '2026-10-02T00:00:00Z', transactionStatus: 'RELEASED' }], null)
  expect(store.count()).toBe(2)
  expect(store.coverage()).toEqual([range])
  expect(store.records().map(row => row.transactionId)).toEqual(['older', 'later'])
  expect(store.records()[1].transactionStatus).toBe('RELEASED')
})
it('retains the last checkpoint when identity is missing and persists state across reopening', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'azulia-sync-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  const store = await openSyncStore(directory, 'account')
  store.enqueue('history', { from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z' })
  expect(() => store.commit(store.jobs()[0], [{ postedDate: '2026-10-01' }], null)).toThrow()
  expect(store.count()).toBe(0)
  store.close()
  const reopened = await openSyncStore(directory, 'account'); cleanup.push(async () => reopened.close())
  expect(reopened.jobs()).toHaveLength(1)
  expect(reopened.coverage()).toHaveLength(0)
})

it('does not republish unchanged records when a recent overlap is revisited', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'azulia-sync-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  const store = await openSyncStore(directory, 'account'); cleanup.push(async () => store.close())
  const range = { from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z' }, record = { transactionId: 'same', postedDate: '2026-10-01T10:00:00Z', transactionStatus: 'RELEASED' }
  store.enqueue('history', range); store.commit(store.jobs()[0], [record], null)
  const revision = store.revision()
  store.enqueue('refresh', range); store.commit(store.jobs()[0], [record], null)
  expect(store.revision()).toBe(revision)
  expect(store.count()).toBe(1)
})

it('delivers only changed source IDs after the initial reading', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'azulia-sync-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  const store = await openSyncStore(directory, 'account'); cleanup.push(async () => store.close())
  const range = { from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z' }
  const first = { transactionId: 'one', postedDate: '2026-10-01T10:00:00Z', transactionStatus: 'DEFERRED' }, second = { ...first, transactionId: 'two' }
  store.enqueue('history', range); store.commit(store.jobs()[0], [first, second], null)
  const revision = store.revision()
  store.enqueue('refresh', range); store.commit(store.jobs()[0], [{ ...first, transactionStatus: 'RELEASED' }, second], null)
  expect(store.changesSince(revision).map(row => row.transactionId)).toEqual(['one'])
  expect(store.count()).toBe(2)
})

it('persists verified order dates and publishes affected financial records without replacing source money', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'azulia-order-dates-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  const store = await openSyncStore(directory, 'account')
  const range = { from: '2026-11-01T00:00:00Z', to: '2026-11-02T00:00:00Z' }, orderId = '111-1234567-1234567'
  const record = { transactionId: 'release', postedDate: '2026-11-01T10:00:00Z', transactionStatus: 'RELEASED', totalAmount: { currencyAmount: '100.00', currencyCode: 'INR' }, relatedIdentifiers: [{ relatedIdentifierName: 'ORDER_ID', relatedIdentifierValue: orderId }] }
  store.enqueue('history', range); store.commit(store.jobs()[0], [record], null)
  const before = store.revision()
  expect(store.pendingOrderDates()).toBe(1)
  store.saveOrderDate(orderId, '2026-10-20T10:00:00Z')
  expect(store.pendingOrderDates()).toBe(0)
  expect(store.changesSince(before)).toMatchObject([{ ...record, azuliaOrderPurchaseDate: '2026-10-20T10:00:00.000Z' }])
  const current = store.revision()
  store.saveOrderDate(orderId, '2026-10-20T10:00:00Z')
  expect(store.revision()).toBe(current)
  store.close()
  const reopened = await openSyncStore(directory, 'account'); cleanup.push(async () => reopened.close())
  expect(reopened.records()[0]).toMatchObject({ ...record, azuliaOrderPurchaseDate: '2026-10-20T10:00:00.000Z' })
  expect(reopened.unresolvedOrders()[0]).toMatchObject({ id: orderId, checked: 0 })
})
it('checkpoints purchase discovery only after its final page and tracks even orders without financial rows', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'azulia-order-pages-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  const store = await openSyncStore(directory, 'account'); cleanup.push(async () => store.close())
  const range = { from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00Z' }
  store.enqueue('purchases', range)
  const job = store.jobs()[0]
  store.commitOrderPage(job, [{ id: '111-1234567-1234567', purchased: '2026-10-20T00:00:00Z' }], 'next')
  expect(store.get('purchaseCoverage')).toBeNull()
  expect(() => store.commitOrderPage(job, [], null)).toThrow('checkpoint')
  store.commitOrderPage(store.jobs()[0], [], null)
  expect(JSON.parse(store.get('purchaseCoverage')!)).toEqual([range])
  expect(store.unresolvedOrders()).toHaveLength(1)
  expect(store.count()).toBe(0)
})
it('quarantines unsupported dates without trapping purchase pagination and resolves corrected identities', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'azulia-order-review-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  const store = await openSyncStore(directory, 'account'); cleanup.push(async () => store.close())
  const id = '111-1234567-1234567', range = { from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00Z' }
  store.enqueue('purchases', range)
  store.commitOrderPage(store.jobs()[0], [], null, [{ orderId: id, raw: JSON.stringify({ AmazonOrderId: id, PurchaseDate: null }), reason: 'Missing purchase date' }])
  expect(store.jobs()).toHaveLength(0)
  expect(store.orderDateIssues()).toBe(1)
  expect(store.missingOrderDates()).toEqual({ id })
  store.saveOrderDate(id, '2026-10-20T00:00:00Z')
  expect(store.orderDateIssues()).toBe(0)
  expect(store.unresolvedOrders()).toEqual([{ id, checked: 0 }])
})
it('publishes cached catalog enrichment without modifying source money', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'azulia-catalog-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  const store = await openSyncStore(directory, 'account'); cleanup.push(async () => store.close())
  store.enqueue('history', { from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00Z' })
  store.commit(store.jobs()[0], [{ transactionId: 'product', postedDate: '2026-10-10T00:00:00Z', transactionStatus: 'RELEASED', totalAmount: { currencyAmount: '100.00', currencyCode: 'INR' }, items: [{ contexts: [{ asin: 'B012345678', sku: 'SKU' }] }] }], null)
  expect(store.pendingCatalog()?.asin).toBe('B012345678')
  const before = store.revision()
  store.saveCatalog({ asin: 'B012345678', title: 'Oak shelf', imageUrl: 'https://images.example.invalid/shelf.jpg' })
  expect(store.changesSince(before)[0]).toMatchObject({ totalAmount: { currencyAmount: '100.00', currencyCode: 'INR' }, azuliaCatalogImages: { B012345678: 'https://images.example.invalid/shelf.jpg' } })
})
it('reuses only continuous fresh financial coverage for initial order-history checks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'azulia-covered-history-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  const store = await openSyncStore(directory, 'account'); cleanup.push(async () => store.close())
  const now = Date.now(), from = new Date(now - 5 * 86400000).toISOString(), to = new Date(now - 5 * 60000).toISOString()
  store.enqueue('history', { from, to }); store.commit(store.jobs()[0], [], null)
  store.saveOrderDate('111-1234567-1234567', new Date(now - 2 * 86400000).toISOString())
  store.saveOrderDate('222-1234567-1234567', new Date(now - 10 * 86400000).toISOString())
  expect(store.pendingOrderCycles()).toBe(2)
  store.acknowledgeCoveredOrderHistories()
  expect(store.pendingOrderCycles()).toBe(1)
  expect(store.unresolvedOrders().find(order => order.id.startsWith('111'))?.checked).toBe(Date.parse(to))
  expect(store.unresolvedOrders().find(order => order.id.startsWith('222'))?.checked).toBe(0)
})

it('publishes order-only and changed-status revisions without adding financial records', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'azulia-orders-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  const store = await openSyncStore(directory, 'account'); cleanup.push(async () => store.close())
  const summary = { id: '111-1234567-1234567', purchased: '2026-11-01T00:00:00Z', status: 'Unshipped', fulfillmentType: 'MFN', orderValue: '1180.00', currency: 'INR' }
  store.saveOrderDate(summary.id, summary.purchased, summary)
  const revision = store.revision()
  expect(store.orders()).toEqual([{ ...summary, purchased: '2026-11-01T00:00:00.000Z' }])
  expect(store.count()).toBe(0)
  store.saveOrderDate(summary.id, summary.purchased, summary)
  expect(store.revision()).toBe(revision)
  store.saveOrderDate(summary.id, summary.purchased, { ...summary, status: 'Canceled' })
  expect(store.revision()).toBe(revision + 1)
  expect(store.orders()).toHaveLength(1)
  expect(store.orders()[0].status).toBe('Canceled')
  expect(store.changesSince(revision)).toEqual([])
})

it('does not publish a data revision for reordered JSON fields but does publish changed unknown values', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'azulia-sync-content-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  const store = await openSyncStore(directory, 'account'); cleanup.push(async () => store.close())
  const range = { from: '2026-11-01T00:00:00Z', to: '2026-11-02T00:00:00Z' }
  const record = { transactionId: 'same-content', postedDate: '2026-11-01T10:00:00Z', transactionStatus: 'DEFERRED', unknown: { first: 'keep', second: 'original' } }
  store.enqueue('history', range); store.commit(store.jobs()[0], [record], null)
  const revision = store.revision()
  const reordered = { unknown: { second: 'original', first: 'keep' }, transactionStatus: 'DEFERRED', postedDate: record.postedDate, transactionId: record.transactionId }
  store.enqueue('refresh', range); store.commit(store.jobs()[0], [reordered], null)
  expect(store.revision()).toBe(revision)
  expect(store.changesSince(revision)).toEqual([])
  store.enqueue('refresh', range); store.commit(store.jobs()[0], [{ ...reordered, unknown: { second: 'changed', first: 'keep' } }], null)
  expect(store.revision()).toBe(revision + 1)
  expect(store.changesSince(revision)).toHaveLength(1)
  expect(store.records()[0].unknown).toEqual({ second: 'changed', first: 'keep' })
})
