import { advertisingGroup, type AdvertisingGroup } from '../../core/advertising/workspace'
import { persistentDevice, readDeviceEntry, writeDeviceEntry } from '../device/workspace'

export interface AdvertisingGroupStore {
  readonly schema: 1
  readonly groups: readonly AdvertisingGroup[]
  readonly history: readonly AdvertisingGroup[]
}
export interface AdvertisingGroupEntry { readonly version: number; readonly value: AdvertisingGroupStore }
export async function advertisingGroupsKey(profileId: string, sellerId: string): Promise<string> {
  if (!profileId || !sellerId) throw new Error('Connect an advertising account before saving product groups.')
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([profileId, sellerId])))
  return `ads-groups:${Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')}`
}
function validate(value: unknown): AdvertisingGroupStore {
  const input = value as AdvertisingGroupStore | null
  if (!input || input.schema !== 1 || !Array.isArray(input.groups) || !Array.isArray(input.history)) throw new Error('Saved advertising groups need review. They were not overwritten.')
  const seen = new Set<string>()
  for (const group of input.groups) {
    advertisingGroup(group)
    if (seen.has(group.id)) throw new Error('Duplicate saved advertising group identity. Existing groups retained.')
    seen.add(group.id)
  }
  for (const group of input.history) advertisingGroup(group)
  return input
}
const empty = (): AdvertisingGroupStore => ({ schema: 1, groups: [], history: [] })
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('azulia-advertising-groups', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('groups')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Advertising group storage is unavailable.'))
  })
}
export async function readAdvertisingGroups(key: string): Promise<AdvertisingGroupEntry> {
  if (!/^ads-groups:[a-f0-9]{64}$/.test(key)) throw new Error('Invalid advertising group account.')
  if (persistentDevice) {
    const entry = await readDeviceEntry<AdvertisingGroupStore>(key)
    return { version: entry.version, value: entry.value === null ? empty() : validate(entry.value) }
  }
  const db = await database()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('groups', 'readonly'), request = transaction.objectStore('groups').get(key)
    request.onsuccess = () => { try { const entry = request.result as AdvertisingGroupEntry | undefined; resolve(entry ? { version: entry.version, value: validate(entry.value) } : { version: 0, value: empty() }) } catch (cause) { reject(cause) } }
    request.onerror = () => reject(new Error('Could not load saved advertising groups.'))
    transaction.oncomplete = () => db.close()
    transaction.onabort = () => { db.close(); reject(new Error('Advertising group read did not complete.')) }
  })
}
async function write(key: string, entry: AdvertisingGroupEntry, value: AdvertisingGroupStore): Promise<number> {
  if (persistentDevice) return (await writeDeviceEntry(key, value, entry.version)).version
  const db = await database()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('groups', 'readwrite'), store = transaction.objectStore('groups'), request = store.get(key)
    let conflict = false
    request.onsuccess = () => {
      if (((request.result as AdvertisingGroupEntry | undefined)?.version ?? 0) !== entry.version) { conflict = true; transaction.abort(); return }
      store.put({ version: entry.version + 1, value }, key)
    }
    transaction.oncomplete = () => { db.close(); resolve(entry.version + 1) }
    transaction.onerror = () => { db.close(); reject(new Error('Advertising groups could not be saved. Previous groups retained.')) }
    transaction.onabort = () => { db.close(); reject(new Error(conflict ? 'Advertising groups changed in another window. Reload them before saving.' : 'Advertising group save was cancelled. Previous groups retained.')) }
  })
}
export function nextAdvertisingGroups(current: AdvertisingGroupStore, request: { id?: string; name: string; productIds: readonly string[] }, newId: string): AdvertisingGroupStore {
  validate(current)
  const previous = request.id ? current.groups.find(group => group.id === request.id) : undefined
  if (request.id && !previous) throw new Error('The advertising group no longer exists. Reload the groups.')
  if (previous?.origin === 'CATALOG') throw new Error('Catalog membership is verified source data. Create a manual group to choose different products.')
  const group = advertisingGroup({ ...previous, id: previous?.id ?? newId, name: request.name, productIds: request.productIds, version: (previous?.version ?? 0) + 1, origin: 'MANUAL' })
  return { ...current, groups: [...current.groups.filter(item => item.id !== group.id), group], history: previous ? [...current.history, previous] : current.history }
}
export async function saveAdvertisingGroup(key: string, entry: AdvertisingGroupEntry, request: { id?: string; name: string; productIds: readonly string[] }): Promise<AdvertisingGroupEntry> {
  const value = nextAdvertisingGroups(entry.value, request, crypto.randomUUID())
  return { version: await write(key, entry, value), value }
}
