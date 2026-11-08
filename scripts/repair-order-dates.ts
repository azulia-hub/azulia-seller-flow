/** Resume one persisted purchase-date page with the production reader. No credentials are logged. */
import { createHash } from 'node:crypto'
import { loadCredentials } from '../server/local/credentials.ts'
import { createOrderDateReader, parseOrderDate } from '../server/local/sync/orders.ts'
import { openSyncStore } from '../server/local/sync/store.ts'
const credentials = await loadCredentials(new URL('../.local/amazon-credentials.json', import.meta.url).pathname)
const key = createHash('sha256').update(JSON.stringify(credentials)).digest('hex')
const store = await openSyncStore(new URL('../.local/activity-cache/', import.meta.url).pathname, key)
try {
  let recovered = 0
  for (const issue of store.orderDateIssueRecords()) {
    try { const order = parseOrderDate(JSON.parse(issue.raw)); store.saveOrderDate(order.id, order.purchased); recovered++ } catch { /* Retain unsupported evidence. */ }
  }
  console.log(JSON.stringify({ recoveredSourceDates: recovered }))
  const nextListAt = Number(store.get('orderListNext') ?? 0)
  if (nextListAt > Date.now()) { console.log(JSON.stringify({ waitingSeconds: Math.ceil((nextListAt - Date.now()) / 1000) })); process.exitCode = 2 }
  else {
    const job = store.jobs().find(job => job.kind === 'purchases')
    if (!job) throw new Error('No persisted purchase page requires repair.')
    store.set('orderListNext', String(Date.now() + 60000))
    const page = await createOrderDateReader(credentials).page(job, new AbortController().signal)
    store.commitOrderPage(job, page.orders, page.nextToken, page.issues)
    store.set('orderError', '')
    console.log(JSON.stringify({ verifiedOrders: page.orders.length, unsupportedOrders: page.issues.length, hasNextPage: Boolean(page.nextToken), unresolvedSourceDates: store.pendingOrderDates(), issues: page.issues.map(issue => { const raw = JSON.parse(issue.raw); return { identifierShape: typeof raw.AmazonOrderId === 'string' ? raw.AmazonOrderId.replace(/[0-9]/g, '#').replace(/[a-z]/g, '?') : typeof raw.AmazonOrderId, purchaseDateType: typeof raw.PurchaseDate, purchaseDatePresent: raw.PurchaseDate !== null && raw.PurchaseDate !== undefined, reason: issue.reason } }) }, null, 2))
  }
} finally { store.close() }
