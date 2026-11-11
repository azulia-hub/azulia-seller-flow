import type { CalculationSettings } from './contracts'
import type { BrowserJob, CacheMeta, CatalogValue } from './contracts'
import type { SourceOrderSummary } from '../amazon-report-sync/protocol'
import type { SharedCache } from './snapshot'
import { sharedRequest } from './client'
export interface SharedStatus { account:string; version:number; meta:CacheMeta; configured:boolean; engine:string; settings: CalculationSettings; settingsVersion:number }
export type { CalculationSettings } from './contracts'
let cached: SharedCache | null = null
let queue: Promise<unknown> = Promise.resolve()
function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.catch(() => {}).then(operation); queue = next; return next
}
export const sharedStatus = () => sharedRequest<SharedStatus>('status')
export function invalidateSharedSource() {cached=null}
export async function sharedMeta(account: string) { return (await sharedRequest<SharedStatus>('status',{account})).meta }
export async function sharedLoad(account: string): Promise<SharedCache> {
  const status = await sharedRequest<SharedStatus>('status',{account})
  if (!cached || cached.meta.account !== account || cached.meta.revision !== status.meta.revision) cached = await sharedRequest<SharedCache>('load',{account})
  // Never pair an older metadata revision with a newer coherent source snapshot.
  return {...cached,meta:cached.meta.revision === status.meta.revision ? status.meta : cached.meta}
}
export function sharedUpdateMeta(account: string, update: (value:CacheMeta) => void) {
  return serialize(async () => {
    for (let attempt=0;attempt<4;attempt++) {
      const status = await sharedRequest<SharedStatus>('status',{account}), metadata = structuredClone(status.meta)
      update(metadata)
      try { return (await sharedRequest<{meta:CacheMeta}>('meta',{account,version:status.version,meta:metadata})).meta }
      catch (cause) { if ((cause as {status?:number}).status !== 409 || attempt===3) throw cause }
    }
    throw new Error('Shared checkpoint is busy. Retry shortly.')
  })
}
export function sharedCommitPage(account: string, owner: string, job: BrowserJob, page: {records?:Record<string,unknown>[];orders?:SourceOrderSummary[];issues?:string[];nextToken:string|null;catalog?:CatalogValue;orderItems?:SourceOrderSummary['items']}) {
  return serialize(async () => { await sharedRequest('page',{account,owner,job,page}); cached=null })
}
