import { nativeRequest } from './bridge'
import { empty, type BrowserJob, type CacheMeta, type CatalogValue } from '../amazon-hosted/cacheTypes'
import type { SourceOrderSummary } from '../amazon-report-sync/protocol'
type Kind = 'records' | 'orders' | 'catalog'
type Table = Kind | 'meta' | 'history'
interface Entry { kind: Kind; id: string; value: unknown }
interface Begin { version: number; state: CacheMeta | null; entries: Entry[] }
interface Page { records?: Record<string, unknown>[]; orders?: SourceOrderSummary[]; catalog?: CatalogValue; backgroundId?: string }
let tail = Promise.resolve()
async function acquire() {
  const previous = tail
  let release!: () => void
  tail = new Promise<void>(resolve => { release = resolve })
  await previous; return release
}
async function read(account: string, keys: Partial<Record<Kind, string[]>> = {}): Promise<Begin> {
  return nativeRequest('source.begin', { account, keys })
}
export async function nativeMeta(account: string): Promise<CacheMeta> { return (await read(account)).state ?? empty(account) }
export async function nativeUpdateMeta(account: string, update: (state: CacheMeta) => void): Promise<CacheMeta> {
  const release = await acquire()
  try {
    const saved = await read(account), state = saved.state ?? empty(account)
    update(state)
    await nativeRequest('source.commit', { account, version: saved.version, state, entries: [], history: [] })
    return state
  } finally { release() }
}
export async function nativeLoadCache(account: string): Promise<{ meta: CacheMeta; records: Record<string, unknown>[]; orders: SourceOrderSummary[]; catalog: CatalogValue[] }> {
  const release = await acquire()
  try {
    const saved = await read(account), rows: Record<Kind, unknown[]> = { records: [], orders: [], catalog: [] }
    for (const kind of ['records', 'orders', 'catalog'] as const) {
      let after = ''
      while (true) {
        const page = await nativeRequest<{ entries: { id: string; value: unknown }[] }>('source.list', { account, kind, after })
        if (!page.entries.length) break
        rows[kind].push(...page.entries.map(row => row.value)); after = page.entries.at(-1)!.id
      }
    }
    if ((await read(account)).state?.revision !== saved.state?.revision) throw new Error('Phone data changed while reading. The next refresh will retry.')
    return { meta: saved.state ?? empty(account), records: rows.records as Record<string, unknown>[], orders: rows.orders as SourceOrderSummary[], catalog: rows.catalog as CatalogValue[] }
  } finally { release() }
}
export async function nativePageTransaction(account: string, job: BrowserJob, page: Page) {
  const release = await acquire()
  try {
    const saved = await read(account, {
      records: (page.records ?? []).map(row => String(row.transactionId ?? '')),
      orders: [...new Set([...(page.orders ?? []).map(row => row.id), ...(job.orderId ? [job.orderId] : [])])],
      catalog: page.catalog ? [page.catalog.asin] : [],
    })
    const values = new Map(saved.entries.map(row => [`${row.kind}:${row.id}`, { account, id: row.id, value: row.value }]))
    const entries = new Map<string, Entry>(), history: unknown[] = []
    let state = saved.state ?? empty(account), closed = false
    const close = () => { if (!closed) { closed = true; release() } }
    return {
      table(name: Table) {
        return {
          async get(key: string | string[]): Promise<unknown> { return name === 'meta' ? state : values.get(`${name}:${Array.isArray(key) ? key[1] : key}`) },
          put(input: unknown) {
            if (name === 'meta') { state = input as CacheMeta; return }
            if (name === 'history') throw new Error('History requires append.')
            const row = input as { id: string; value: unknown }
            const key = `${name}:${row.id}`
            entries.set(key, { kind: name, id: row.id, value: row.value }); values.set(key, { ...row, account })
          },
          add(value: unknown) { if (name !== 'history') throw new Error('Unsupported append.'); history.push(value) },
        }
      },
      async commit() {
        try {
          if (page.backgroundId && job.id.startsWith('background:')) state.jobs = state.jobs.filter(item => item.id !== job.id)
          await nativeRequest('source.commit', { account, version: saved.version, state, entries: [...entries.values()], history, backgroundId: page.backgroundId })
        }
        finally { close() }
      },
      abort: close,
    }
  } catch (cause) { release(); throw cause }
}
export async function nativeClearRecent(account: string, cutoff = new Date(Date.now() - 48 * 3600000).toISOString()) {
  // Refresh coverage without deleting persisted source orders or completed results.
  await nativeUpdateMeta(account, state => {
    state.purchaseCoverage = state.purchaseCoverage.filter(range => range.to < cutoff)
    state.coverage = state.coverage.filter(range => range.to < cutoff)
    state.jobs = state.jobs.filter(job => job.to < cutoff)
  })
}
