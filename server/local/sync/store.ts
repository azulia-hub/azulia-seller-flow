import { DatabaseSync } from 'node:sqlite'
import { sameContent } from '../../../src/core/sync/sameContent.ts'
import { mkdir, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { mergeCoverage, missingRanges, type SyncRange } from '../../../src/core/sync/ranges.ts'
import { object, text } from '../../../src/adapters/amazon-report-sync/money.ts'
import type { SourceOrderSummary } from '../../../src/adapters/amazon-report-sync/protocol.ts'
import type { OrderDateIssue } from './orders.ts'
export interface Job extends SyncRange { id: number; kind: string; orderId: string | null; nextToken: string | null; createdAt: number }
export async function openSyncStore(directory: string, key: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700)
  const path = join(directory, `activity-${key}.sqlite`), db = new DatabaseSync(path)
  await chmod(path, 0o600)
  db.exec(`PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY,date TEXT NOT NULL,raw TEXT NOT NULL,order_id TEXT,status TEXT NOT NULL,checked INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS changes (id TEXT PRIMARY KEY,revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY,source_id TEXT NOT NULL,raw TEXT NOT NULL,observed INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS rejected (id INTEGER PRIMARY KEY,raw TEXT NOT NULL,observed INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY,kind TEXT NOT NULL,start TEXT NOT NULL,stop TEXT NOT NULL,order_id TEXT,next_token TEXT,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS catalog_items (asin TEXT PRIMARY KEY,title TEXT,image_url TEXT,checked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS record_asins (record_id TEXT NOT NULL,asin TEXT NOT NULL,PRIMARY KEY(record_id,asin));
    CREATE INDEX IF NOT EXISTS asin_records ON record_asins(asin,record_id);
    CREATE TABLE IF NOT EXISTS order_summaries (id TEXT PRIMARY KEY,raw TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS order_dates (id TEXT PRIMARY KEY,purchased TEXT,checked INTEGER NOT NULL DEFAULT 0,cycle_checked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS order_date_issues (id TEXT PRIMARY KEY,order_id TEXT NOT NULL,raw TEXT NOT NULL,reason TEXT NOT NULL,resolved INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS record_dates ON records(date,id);
    CREATE INDEX IF NOT EXISTS record_orders ON records(order_id);
    CREATE INDEX IF NOT EXISTS order_cycle_dates ON order_dates(cycle_checked,id);`)
  try { db.exec('ALTER TABLE order_dates ADD COLUMN items_checked INTEGER NOT NULL DEFAULT 0') } catch {}
  const get = (key: string) => (db.prepare('SELECT value FROM meta WHERE key=?').get(key) as { value: string } | undefined)?.value ?? null
  const set = (key: string, value: string) => { db.prepare('INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value) }
  if (!get('deltaBase')) set('deltaBase', get('revision') ?? '0')
  const revision = () => Number(get('revision') ?? 0)
  const coverage = () => JSON.parse(get('coverage') ?? '[]') as SyncRange[]
  const jobs = () => (db.prepare('SELECT id,kind,start AS "from",stop AS "to",order_id AS orderId,next_token AS nextToken,created AS createdAt FROM jobs ORDER BY id').all() as unknown as Job[])
  const catalogAsins = (record: Record<string, unknown>) => [...new Set((Array.isArray(record.items) ? record.items : []).flatMap(value => { const item = object(value); return (Array.isArray(item.contexts) ? item.contexts : []).map(value => text(object(value).asin)).filter(asin => /^[A-Z0-9]{10}$/.test(asin)) }))]
  const insertCatalog = db.prepare('INSERT INTO catalog_items(asin) VALUES(?) ON CONFLICT(asin) DO NOTHING')
  const insertAsin = db.prepare('INSERT INTO record_asins VALUES(?,?) ON CONFLICT DO NOTHING')
  const indexAsins = (id: string, record: Record<string, unknown>) => { for (const asin of catalogAsins(record)) { insertCatalog.run(asin); insertAsin.run(id, asin) } }
  if (!get('catalogSeeded')) {
    db.exec('BEGIN IMMEDIATE')
    try { for (const row of db.prepare('SELECT id,raw FROM records').all() as { id: string; raw: string }[]) indexAsins(row.id, JSON.parse(row.raw)); set('catalogSeeded', '1'); db.exec('COMMIT') } catch (cause) { db.exec('ROLLBACK'); throw cause }
  }
  const decode = (rows: { raw: string; purchased: string | null }[]) => {
    const catalog = new Map((db.prepare('SELECT asin,title,image_url FROM catalog_items').all() as { asin: string; title: string | null; image_url: string | null }[]).map(item => [item.asin, item]))
    return rows.map(row => { const raw = JSON.parse(row.raw) as Record<string, unknown>, asins = catalogAsins(raw); return { ...raw, azuliaOrderPurchaseDate: row.purchased, azuliaCatalogImages: Object.fromEntries(asins.map(asin => [asin, catalog.get(asin)?.image_url ?? null])), azuliaCatalogTitles: Object.fromEntries(asins.map(asin => [asin, catalog.get(asin)?.title ?? null])) } })
  }

  function saveOrderDate(id: string, purchased: string, summary?: SourceOrderSummary) {
    if (!/^[A-Z0-9]{3}-\d{7}-\d{7}$/.test(id) || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(purchased) || !Number.isFinite(Date.parse(purchased))) throw new Error('Order purchase date is unsupported; no date was inferred.')
    const normalized = new Date(purchased).toISOString()
    const old = db.prepare('SELECT purchased FROM order_dates WHERE id=?').get(id) as { purchased: string | null } | undefined
    db.prepare('INSERT INTO order_dates(id,purchased,checked) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET purchased=excluded.purchased,checked=excluded.checked').run(id, normalized, Date.now())
    db.prepare('UPDATE order_date_issues SET resolved=1 WHERE order_id=?').run(id)
    let summaryChanged = false
    if (summary) {
      if (summary.id !== id || new Date(summary.purchased).toISOString() !== normalized) throw new Error('Order summary identity differs from its verified date.')
      const previous = db.prepare('SELECT raw FROM order_summaries WHERE id=?').get(id) as { raw: string } | undefined
      const prevParsed = previous?.raw ? JSON.parse(previous.raw) as Record<string, unknown> : undefined
      const sku = summary.sku ?? prevParsed?.sku
      const asin = summary.asin ?? prevParsed?.asin
      const title = summary.title ?? prevParsed?.title
      const imageUrl = summary.imageUrl ?? prevParsed?.imageUrl
      const items = summary.items ?? prevParsed?.items
      const raw = JSON.stringify({
        id,
        purchased: normalized,
        status: summary.status,
        fulfillmentType: summary.fulfillmentType,
        orderValue: summary.orderValue,
        currency: summary.currency,
        ...(sku ? { sku } : {}),
        ...(asin ? { asin } : {}),
        ...(title ? { title } : {}),
        ...(imageUrl ? { imageUrl } : {}),
        ...(items && Array.isArray(items) && items.length ? { items } : {}),
      })
      summaryChanged = previous?.raw !== raw
      if (summaryChanged) db.prepare('INSERT INTO order_summaries VALUES(?,?) ON CONFLICT(id) DO UPDATE SET raw=excluded.raw').run(id, raw)
    }
    if (old?.purchased !== normalized || summaryChanged) {
      const next = revision() + 1
      db.prepare('INSERT INTO changes(id,revision) SELECT id,? FROM records WHERE order_id=? ON CONFLICT(id) DO UPDATE SET revision=excluded.revision').run(next, id)
      set('revision', String(next)); set('updatedAt', new Date().toISOString())
    }
  }
  function retainOrderDateIssue(issue: OrderDateIssue) {
    const resolved = db.prepare('SELECT id FROM order_dates WHERE id=? AND purchased IS NOT NULL').get(issue.orderId) ? 1 : 0
    db.prepare('INSERT INTO order_date_issues(id,order_id,raw,reason,resolved) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET reason=excluded.reason,resolved=excluded.resolved').run(issue.raw, issue.orderId, issue.raw, issue.reason, resolved)
    if (/^[A-Z0-9]{3}-\d{7}-\d{7}$/.test(issue.orderId)) db.prepare('INSERT INTO order_dates(id,checked) VALUES(?,0) ON CONFLICT(id) DO NOTHING').run(issue.orderId)
  }
  function atomic(action: () => void) { db.exec('BEGIN IMMEDIATE'); try { action(); db.exec('COMMIT') } catch (error) { db.exec('ROLLBACK'); throw error } }
  return {
    get, set, revision, coverage, jobs,
    pendingCatalog() { return db.prepare('SELECT c.asin FROM catalog_items c LEFT JOIN record_asins r ON r.asin=c.asin WHERE c.checked<? GROUP BY c.asin,c.checked ORDER BY c.checked,count(r.record_id) DESC LIMIT 1').get(Date.now() - 7 * 86400000) as { asin: string } | undefined },
    catalogPending() { return Number((db.prepare('SELECT count(*) AS count FROM catalog_items WHERE checked=0').get() as { count: number }).count) },
    saveCatalog(item: { asin: string; title: string | null; imageUrl: string | null }) {
      atomic(() => {
        const before = db.prepare('SELECT title,image_url FROM catalog_items WHERE asin=?').get(item.asin) as { title: string | null; image_url: string | null } | undefined
        db.prepare('UPDATE catalog_items SET title=?,image_url=?,checked=? WHERE asin=?').run(item.title, item.imageUrl, Date.now(), item.asin)
        if (before?.title !== item.title || before?.image_url !== item.imageUrl) {
          const next = revision() + 1
          db.prepare('INSERT INTO changes(id,revision) SELECT record_id,? FROM record_asins WHERE asin=? ON CONFLICT(id) DO UPDATE SET revision=excluded.revision').run(next, item.asin)
          set('revision', String(next)); set('updatedAt', new Date().toISOString())
        }
      })
    },
    deferCatalog(asin: string) { db.prepare('UPDATE catalog_items SET checked=? WHERE asin=?').run(Date.now(), asin) },
    acknowledgeCoveredOrderHistories() {
      const windows = coverage(), through = windows.map(window => window.to).sort().at(-1)
      if (!through || Date.parse(through) < Date.now() - 30 * 60000) return
      atomic(() => {
        for (const order of db.prepare('SELECT id,purchased FROM order_dates WHERE purchased IS NOT NULL AND cycle_checked=0').all() as { id: string; purchased: string }[]) {
          if (order.purchased <= through && !missingRanges({ from: order.purchased, to: through }, windows).length) db.prepare('UPDATE order_dates SET cycle_checked=? WHERE id=?').run(Date.parse(through), order.id)
        }
      })
    },
    enqueue(kind: string, range: SyncRange, orderId: string | null = null) { if (!db.prepare('SELECT id FROM jobs WHERE kind=? AND start=? AND stop=? AND order_id IS ?').get(kind, range.from, range.to, orderId)) db.prepare('INSERT INTO jobs(kind,start,stop,order_id,created) VALUES(?,?,?,?,?)').run(kind, range.from, range.to, orderId, Date.now()) },
    discardJob(id: number) { db.prepare('DELETE FROM jobs WHERE id=?').run(id) },
    orders() {
      const catalog = new Map((db.prepare('SELECT asin,title,image_url FROM catalog_items').all() as { asin: string; title: string | null; image_url: string | null }[]).map(item => [item.asin, item]))
      const orderAsins = new Map((db.prepare('SELECT r.order_id, ra.asin FROM records r JOIN record_asins ra ON ra.record_id=r.id WHERE r.order_id IS NOT NULL GROUP BY r.order_id').all() as { order_id: string; asin: string }[]).map(r => [r.order_id, r.asin]))
      return (db.prepare('SELECT o.id,o.purchased,s.raw FROM order_dates o LEFT JOIN order_summaries s ON s.id=o.id WHERE o.purchased IS NOT NULL ORDER BY o.purchased,o.id').all() as { id: string; purchased: string; raw: string | null }[]).map(order => {
        if (!order.raw) return { id: order.id, purchased: order.purchased, status: null, fulfillmentType: null, orderValue: null, currency: null }
        const parsed = JSON.parse(order.raw) as SourceOrderSummary
        const asin = parsed.asin ?? orderAsins.get(order.id)
        const cat = asin ? catalog.get(asin) : undefined
        const title = parsed.title ?? cat?.title
        const imageUrl = parsed.imageUrl ?? cat?.image_url
        return {
          ...parsed,
          ...(asin && !parsed.asin ? { asin } : {}),
          purchased: order.purchased,
          ...(title ? { title } : {}),
          ...(imageUrl ? { imageUrl } : {}),
        } as SourceOrderSummary
      })
    },
    saveOrderItems(id: string, items: readonly { asin: string | null; sku: string | null; title: string | null; quantity: number; price?: string | null; currency?: string | null }[]) {
      atomic(() => {
        db.prepare('UPDATE order_dates SET items_checked=? WHERE id=?').run(Date.now(), id)
        const existing = db.prepare('SELECT raw FROM order_summaries WHERE id=?').get(id) as { raw: string } | undefined
        if (!existing) return
        const parsed = JSON.parse(existing.raw) as Record<string, unknown>
        const primary = items[0]
        if (primary?.asin) insertCatalog.run(primary.asin)
        const itemsTotal = items.reduce((sum, it) => {
          const p = Number(it.price)
          return Number.isFinite(p) && p > 0 ? sum + p * (it.quantity || 1) : sum
        }, 0)
        const updated = {
          ...parsed,
          sku: primary?.sku ?? parsed.sku ?? null,
          asin: primary?.asin ?? parsed.asin ?? null,
          title: primary?.title ?? parsed.title ?? null,
          orderValue: parsed.orderValue ?? (itemsTotal > 0 ? itemsTotal.toFixed(2) : null),
          currency: parsed.currency ?? (primary?.currency ?? null),
          items: items.map(i => ({ asin: i.asin, sku: i.sku, title: i.title, quantity: i.quantity, price: i.price ?? null, currency: i.currency ?? null })),
        }
        db.prepare('UPDATE order_summaries SET raw=? WHERE id=?').run(JSON.stringify(updated), id)
        const nextRev = revision() + 1
        set('revision', String(nextRev))
        set('updatedAt', new Date().toISOString())
      })
    },
    deferOrderItems(id: string) {
      db.prepare('UPDATE order_dates SET items_checked=? WHERE id=?').run(Date.now(), id)
    },
    missingOrderItems() {
      return db.prepare(`
        SELECT o.id FROM order_dates o
        JOIN order_summaries s ON s.id=o.id
        WHERE o.purchased IS NOT NULL
          AND s.raw NOT LIKE '%"sku"%'
          AND coalesce(o.items_checked,0) < ?
          AND NOT EXISTS (SELECT 1 FROM records r WHERE r.order_id=o.id)
        ORDER BY o.purchased DESC
        LIMIT 1
      `).get(Date.now() - 6 * 3600000) as { id: string } | undefined
    },
    staleOrderSummary() { return db.prepare('SELECT id FROM order_dates WHERE purchased IS NOT NULL AND checked<? ORDER BY checked LIMIT 1').get(Date.now() - 6 * 3600000) as { id: string } | undefined },
    records() { return decode(db.prepare('SELECT r.raw,o.purchased FROM records r LEFT JOIN order_dates o ON o.id=r.order_id ORDER BY r.date,r.id').all() as { raw: string; purchased: string | null }[]) },
    changesSince(since: number) { return decode(db.prepare('SELECT r.raw,o.purchased FROM records r JOIN changes c ON c.id=r.id LEFT JOIN order_dates o ON o.id=r.order_id WHERE c.revision>? ORDER BY r.date,r.id').all(since) as { raw: string; purchased: string | null }[]) },
    count: () => Number((db.prepare('SELECT count(*) AS count FROM records').get() as { count: number }).count),
    unresolvedOrders() { return (db.prepare('SELECT id,cycle_checked AS checked FROM order_dates WHERE purchased IS NOT NULL ORDER BY cycle_checked LIMIT 20').all() as { id: string; checked: number }[]) },
    missingOrderDates() { return db.prepare("SELECT id FROM (SELECT r.order_id AS id,r.date AS priority FROM records r LEFT JOIN order_dates o ON o.id=r.order_id WHERE r.order_id IS NOT NULL AND o.purchased IS NULL AND coalesce(o.checked,0)<? UNION ALL SELECT id,'' AS priority FROM order_dates WHERE purchased IS NULL AND checked<?) ORDER BY priority DESC LIMIT 1").get(Date.now() - 6 * 3600000, Date.now() - 6 * 3600000) as { id: string } | undefined },
    pendingOrderDates() { return Number((db.prepare('SELECT count(DISTINCT r.order_id) AS count FROM records r LEFT JOIN order_dates o ON o.id=r.order_id WHERE r.order_id IS NOT NULL AND o.purchased IS NULL AND NOT EXISTS (SELECT 1 FROM order_date_issues issue WHERE issue.order_id=r.order_id AND issue.resolved=0)').get() as { count: number }).count) },
    pendingOrderCycles() { return Number((db.prepare('SELECT count(*) AS count FROM order_dates WHERE purchased IS NOT NULL AND cycle_checked=0').get() as { count: number }).count) },
    orderDateIssueRecords() { return db.prepare('SELECT raw FROM order_date_issues WHERE resolved=0 LIMIT 100').all() as { raw: string }[] },
    orderDateIssues() { return Number((db.prepare('SELECT count(*) AS count FROM order_date_issues WHERE resolved=0').get() as { count: number }).count) },
    retainOrderDateIssue(issue: OrderDateIssue) { atomic(() => retainOrderDateIssue(issue)) },
    deferOrderDate(id: string) { db.prepare('INSERT INTO order_dates(id,checked) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET checked=excluded.checked').run(id, Date.now()) },
    saveOrderDate(id: string, purchased: string, summary?: SourceOrderSummary) { atomic(() => saveOrderDate(id, purchased, summary)) },
    commitOrderPage(job: Job, orders: readonly { id: string; purchased: string; summary?: SourceOrderSummary }[], nextToken: string | null, issues: readonly OrderDateIssue[] = []) {
      atomic(() => {
        const checkpoint = db.prepare('SELECT next_token AS nextToken FROM jobs WHERE id=?').get(job.id) as { nextToken: string | null } | undefined
        if (!checkpoint || checkpoint.nextToken !== job.nextToken) throw new Error('A newer order page advanced this checkpoint.')
        for (const order of orders) saveOrderDate(order.id, order.purchased, order.summary)
        for (const issue of issues) retainOrderDateIssue(issue)
        if (nextToken) db.prepare('UPDATE jobs SET next_token=? WHERE id=?').run(nextToken, job.id)
        else {
          const before = JSON.parse(get('purchaseCoverage') ?? '[]') as SyncRange[]
          set('purchaseCoverage', JSON.stringify(mergeCoverage([...before, { from: job.from, to: job.to }])))
          db.prepare('DELETE FROM jobs WHERE id=?').run(job.id)
        }
      })
    },
    reject(raw: string) { db.prepare('INSERT INTO rejected(raw,observed) VALUES(?,?)').run(raw, Date.now()) },
    commit(job: Job, records: readonly Record<string, unknown>[], nextToken: string | null) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const checkpoint = db.prepare('SELECT next_token AS nextToken FROM jobs WHERE id=?').get(job.id) as { nextToken: string | null } | undefined
        if (!checkpoint || checkpoint.nextToken !== job.nextToken) throw new Error('A newer source page already advanced this checkpoint.')
        let changed = false
        const changedIds: string[] = []
        for (const record of records) {
          const id = text(record.transactionId), raw = JSON.stringify(record)
          if (!id || !Number.isFinite(Date.parse(text(record.postedDate)))) throw new Error('A source record has no reliable transaction ID or posting date; the checkpoint was not advanced.')
          const previous = db.prepare('SELECT raw FROM records WHERE id=?').get(id) as { raw: string } | undefined
          if (!previous || previous.raw !== raw && !sameContent(JSON.parse(previous.raw), record)) {
            if (previous) db.prepare('INSERT INTO history(source_id,raw,observed) VALUES(?,?,?)').run(id, previous.raw, Date.now())
            const related = Array.isArray(record.relatedIdentifiers) ? record.relatedIdentifiers.map(object) : []
            const orders = [...new Set(related.filter(row => row.relatedIdentifierName === 'ORDER_ID').map(row => text(row.relatedIdentifierValue)).filter(Boolean))]
            db.prepare('INSERT INTO records VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET date=excluded.date,raw=excluded.raw,order_id=excluded.order_id,status=excluded.status,checked=excluded.checked').run(id, new Date(text(record.postedDate)).toISOString(), raw, orders.length === 1 ? orders[0] : null, text(record.transactionStatus), Date.now())
            db.prepare('DELETE FROM record_asins WHERE record_id=?').run(id); indexAsins(id, record)
            changed = true; changedIds.push(id)
          } else db.prepare('UPDATE records SET checked=? WHERE id=?').run(Date.now(), id)
        }
        if (nextToken) db.prepare('UPDATE jobs SET next_token=? WHERE id=?').run(nextToken, job.id)
        else {
          if (job.kind === 'history' || job.kind === 'refresh') { const before = JSON.stringify(coverage()), after = JSON.stringify(mergeCoverage([...coverage(), { from: job.from, to: job.to }])); set('coverage', after); if (before !== after && revision() === 0) changed = true }
          if (job.kind === 'order') { db.prepare('UPDATE records SET checked=? WHERE order_id=?').run(Date.now(), job.orderId); db.prepare('UPDATE order_dates SET cycle_checked=? WHERE id=?').run(Date.now(), job.orderId) }
          db.prepare('DELETE FROM jobs WHERE id=?').run(job.id)
          set('lastSync', new Date().toISOString())
        }
        if (changed) { const nextRevision = revision() + 1; for (const id of changedIds) db.prepare('INSERT INTO changes VALUES(?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision').run(id, nextRevision); set('revision', String(nextRevision)); set('updatedAt', new Date().toISOString()) }
        db.exec('COMMIT')
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
    close() { db.close() },
  }
}
export type SyncStore = Awaited<ReturnType<typeof openSyncStore>>
