/** Explicit local comparison only: no network, no credential reads, no source-cache writes. */
import { createServer } from 'vite'
import { DatabaseSync } from 'node:sqlite'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { resolve, basename } from 'node:path'
const csvPath = resolve(process.argv[2] ?? 'reprot/2026Feb1-2026Oct31CustomUnifiedTransaction.csv')
const cacheDirectory = resolve('.local/activity-cache'), outputDirectory = resolve('.local/reconciliation')
const dbName = process.argv[3] ?? (await readdir(cacheDirectory)).find(name => name.endsWith('.sqlite'))
if (!dbName) throw new Error('No local API cache was found.')
const db = new DatabaseSync(resolve(cacheDirectory, dbName), { readOnly: true })
let records, cacheMeta
try {
  db.exec('BEGIN')
  const hasDates = db.prepare("SELECT name FROM sqlite_master WHERE name='order_dates'").get()
  records = (hasDates ? db.prepare('SELECT r.raw,o.purchased FROM records r LEFT JOIN order_dates o ON o.id=r.order_id ORDER BY r.date,r.id').all() : db.prepare('SELECT raw,NULL AS purchased FROM records ORDER BY date,id').all()).map(row => ({ ...JSON.parse(row.raw), azuliaOrderPurchaseDate: row.purchased }))
  cacheMeta = Object.fromEntries(db.prepare('SELECT key,value FROM meta').all().filter(row => ['coverage','purchaseCoverage','lastSync','error','orderError','revision'].includes(row.key)).map(row => [row.key, row.value]))
  db.exec('COMMIT')
} finally { db.close() }
await mkdir(outputDirectory, { recursive: true, mode: 0o700 })
const frozenSnapshot = JSON.stringify({ records, cacheMeta })
await writeFile(resolve(outputDirectory, 'input-api-snapshot.json'), frozenSnapshot, { mode: 0o600 })
await writeFile(resolve(outputDirectory, `input-api-snapshot-${cacheMeta.revision}.json`), frozenSnapshot, { mode: 0o600 })
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
try {
  const { parseCsvDataset } = await server.ssrLoadModule('/src/core/csv/parseCsv.ts')
  const { amazonUnifiedTransactionAdapter } = await server.ssrLoadModule('/src/adapters/amazon/unifiedTransactionAdapter.ts')
  const { toUnifiedReport } = await server.ssrLoadModule('/src/adapters/amazon-report-sync/toUnifiedReport.ts')
  const { buildOrderCohort, isDeferred } = await server.ssrLoadModule('/src/core/analytics/orderLifecycle.ts')
  const { summarizeDashboard, canonicalDateKey, filterEvents } = await server.ssrLoadModule('/src/core/analytics/dashboardSummary.ts')
  const raw = parseCsvDataset(await readFile(csvPath, 'utf8'), 'private-csv-reference', basename(csvPath))
  const csv = amazonUnifiedTransactionAdapter.normalize(raw)
  const snapshot = { connectionKey: 'private-comparison', revision: Number(cacheMeta.revision), updatedAt: cacheMeta.lastSync ?? null, records, coverage: JSON.parse(cacheMeta.coverage ?? '[]') }
  const api = toUnifiedReport(snapshot)
  const fullRange = { from: '2026-02-01', to: '2026-10-31' }
  const csvCohort = buildOrderCohort(csv.events, fullRange)
  const csvDates = new Map(csvCohort.orders.map(order => [order.orderId, order.saleDate]))
  // This is a diagnostic alignment, NEVER written into production metadata or presented as verified PurchaseDate.
  const alignedEvents = api.dataset.events.map(event => ({ ...event, orderPurchaseDate: csvDates.get(event.orderId) ?? event.orderPurchaseDate }))
  const round = value => Math.round(value * 100) / 100
  const metrics = events => {
    const s = summarizeDashboard(events)
    return Object.fromEntries(['grossSales','soldQuantity','refundValue','returnQuantity','marketplaceCharges','netEasyShipFee','adsSpend','reimbursements','taxNet','operatingNet','unclassifiedAmount'].map(key => [key, s[key]]))
  }
  const monthly = []
  for (let month = 2; month <= 10; month++) {
    const from = `2026-${String(month).padStart(2, '0')}-01`, to = new Date(Date.UTC(2026, month, 0)).toISOString().slice(0, 10), range = { from, to }
    const left = buildOrderCohort(csv.events, range), right = buildOrderCohort(api.dataset.events, range), aligned = buildOrderCohort(alignedEvents, range)
    monthly.push({ month: from.slice(0, 7), csv: metrics(left.events), api: metrics(right.events), apiWithCsvOriginDiagnostic: metrics(aligned.events), csvPending: metrics(left.pendingEvents), apiPending: metrics(right.pendingEvents), csvOrders: left.orders.length, apiOrders: right.orders.length, missingApiOrigins: right.missingSale.length })
  }
  // Compare the same activity cutoff separately from the full later order cycle.
  // Released records can be posted later; explicit deferred/release links retain original activity time.
  const { cents } = await server.ssrLoadModule('/src/adapters/amazon-report-sync/money.ts')
  const sourceById = new Map(records.map(record => [record.transactionId, record]))
  const parents = new Map(records.map(record => [record.transactionId, record.transactionId]))
  const root = id => { let next = id; while (parents.get(next) !== next) next = parents.get(next); return next }
  for (const record of records) for (const reference of record.relatedIdentifiers ?? []) {
    if (!['DEFERRED_TRANSACTION_ID','RELEASE_TRANSACTION_ID'].includes(reference.relatedIdentifierName)) continue
    const linked = sourceById.get(reference.relatedIdentifierValue)
    if (linked && linked.transactionType === record.transactionType && cents(linked.totalAmount?.currencyAmount) === cents(record.totalAmount?.currencyAmount)) { const a = root(record.transactionId), b = root(linked.transactionId); if (a !== b) parents.set(b, a) }
  }
  const earliest = new Map()
  for (const record of records) { const key = root(record.transactionId); earliest.set(key, [earliest.get(key), record.postedDate].filter(Boolean).sort()[0]) }
  const activityFrom = Date.parse(`${fullRange.from}T00:00:00+05:30`), activityThrough = Date.parse(`${fullRange.to}T00:00:00+05:30`) + 86400000
  const apiAtCsvCutoff = api.dataset.events.filter(event => { const id = event.raw['api transaction id']; const timestamp = Date.parse(earliest.get(root(id)) ?? ''); return timestamp >= activityFrom && timestamp < activityThrough })
  const sharedIds = new Set(api.dataset.events.map(e => e.orderId).filter(id => id && csvDates.has(id)))
  const csvOrderRows = csv.events.filter(e => sharedIds.has(e.orderId)), apiOrderRows = api.dataset.events.filter(e => sharedIds.has(e.orderId))
  const sameCutoff = { csv: metrics(csvOrderRows.filter(e => !isDeferred(e))), api: metrics(apiAtCsvCutoff.filter(e => sharedIds.has(e.orderId) && !isDeferred(e))), csvPending: metrics(csvOrderRows.filter(isDeferred)), apiPending: metrics(apiAtCsvCutoff.filter(e => sharedIds.has(e.orderId) && isDeferred(e))) }
  const sameCutoffDifference = Object.fromEntries(Object.keys(sameCutoff.csv).map(key => [key, round(sameCutoff.api[key] - sameCutoff.csv[key])]))
  const csvSelectedIds = new Set(csvCohort.orders.map(order => order.orderId))
  const apiScope = apiAtCsvCutoff.filter(event => !event.orderId || csvSelectedIds.has(event.orderId))
  const fullReportScope = { csv: metrics(csvCohort.events), api: metrics(apiScope.filter(event => !isDeferred(event))), csvPending: metrics(csvCohort.pendingEvents), apiPending: metrics(apiScope.filter(isDeferred)) }
  const fullReportScopeDifference = Object.fromEntries(Object.keys(fullReportScope.csv).map(key => [key, round(fullReportScope.api[key] - fullReportScope.csv[key])]))
  const observedDifference = Object.fromEntries(Object.keys(fullReportScope.csv).map(key => [key, round(fullReportScope.api[key] + fullReportScope.apiPending[key] - fullReportScope.csv[key] - fullReportScope.csvPending[key])]))
  const group = events => {
    const groups = new Map()
    for (const e of events) {
      const key = JSON.stringify([e.orderId, null, e.event, e.amountType, isDeferred(e) ? 'PENDING' : 'RELEASED'])
      const previous = groups.get(key) ?? { amount: 0, events: 0, quantity: 0 }
      previous.amount = round(previous.amount + e.amount); previous.events++; previous.quantity += e.amountType === 'PRODUCT_REVENUE' ? e.quantity ?? 0 : 0; groups.set(key, previous)
    }
    return groups
  }
  const left = group(csvOrderRows), right = group(apiOrderRows), differences = []
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const l = left.get(key) ?? { amount: 0, events: 0, quantity: 0 }, r = right.get(key) ?? { amount: 0, events: 0, quantity: 0 }
    if (Math.abs(l.amount - r.amount) > .005 || l.quantity !== r.quantity) differences.push({ key: JSON.parse(key), csv: l, api: r, difference: round(r.amount - l.amount) })
  }
  const breakdown = {}
  for (const row of differences) {
    const key = `${row.key[2]}/${row.key[3]}/${row.key[4]}`
    const b = breakdown[key] ?? { groups: 0, csv: 0, api: 0, difference: 0 }
    b.groups++; b.csv = round(b.csv + row.csv.amount); b.api = round(b.api + row.api.amount); b.difference = round(b.difference + row.difference); breakdown[key] = b
  }
  const sharedMonth = snapshot.coverage.map(w => ({ fromDate: canonicalDateKey(new Date(Date.parse(w.from) + 330 * 60000).toISOString()), toDate: canonicalDateKey(new Date(Date.parse(w.to) + 330 * 60000).toISOString()) }))
  const byStatus = events => Object.fromEntries(['Released','Deferred','Unknown'].map(status => [status, metrics(events.filter(e => e.status === status))]))
  const evidence = { createdAt: new Date().toISOString(), file: basename(csvPath), cacheMeta, csvRows: raw.rows.length, apiRecords: records.length, csvReconciliation: csv.quality.reconciliation, apiReconciliation: api.dataset.quality.reconciliation, monthly, sharedOrderCount: sharedIds.size, sharedOrderMetrics: { csv: metrics(csvOrderRows.filter(e => !isDeferred(e))), api: metrics(apiOrderRows.filter(e => !isDeferred(e))) }, sameCutoff, sameCutoffDifference, fullReportScope, fullReportScopeDifference, observedDifference, sharedOrderDifferences: breakdown, differences, apiIssues: api.issues, apiPostedStatuses: byStatus(api.dataset.events), csvPostedStatuses: byStatus(csv.events), csvEventsInApiPostingCoverage: sharedMonth.map(range => ({ range, totals: metrics(filterEvents(csv.events, range)) })) }
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 })
  await writeFile(resolve(outputDirectory, 'csv-api-comparison.json'), JSON.stringify(evidence, null, 2), { mode: 0o600 })
  console.log(JSON.stringify({ file: basename(csvPath), cacheMeta, rows: { csv: raw.rows.length, api: records.length }, reconciled: { csv: csv.quality.reconciliation, api: api.dataset.quality.reconciliation }, monthly: monthly.map(row => ({ month: row.month, csvSales: row.csv.grossSales, apiSales: row.api.grossSales, alignedDiagnosticSales: row.apiWithCsvOriginDiagnostic.grossSales, csvOrders: row.csvOrders, apiOrders: row.apiOrders, missingApiOrigins: row.missingApiOrigins })), sharedOrderCount: sharedIds.size, sharedOrderMetrics: evidence.sharedOrderMetrics, sameCutoff, sameCutoffDifference, fullReportScope, fullReportScopeDifference, observedDifference, sharedOrderDifferences: breakdown, privateEvidence: '.local/reconciliation/csv-api-comparison.json' }, null, 2))
} finally { await server.close() }
