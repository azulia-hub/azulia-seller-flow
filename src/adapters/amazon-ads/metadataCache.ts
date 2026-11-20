import { persistentDevice, readDeviceEntry, writeDeviceEntry } from '../device/workspace'
export async function adsMetadataKey(profile: string, category: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([profile, category])))
  return `ads-entities:${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`
}
function database(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const r = indexedDB.open('azulia-ads-metadata', 1); r.onupgradeneeded = () => r.result.createObjectStore('cache'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) }) }
export async function readAdsMetadata<T>(key: string): Promise<T | null> {
  if (persistentDevice) return (await readDeviceEntry<T>(key)).value
  const db = await database()
  return new Promise((resolve, reject) => { const tx = db.transaction('cache'), r = tx.objectStore('cache').get(key); r.onsuccess = () => resolve(r.result ?? null); r.onerror = () => reject(r.error); tx.oncomplete = () => db.close() })
}
export async function writeAdsMetadata(key: string, value: unknown) {
  if (persistentDevice) { const current = await readDeviceEntry(key); await writeDeviceEntry(key, value, current.version); return }
  const db = await database()
  await new Promise<void>((resolve, reject) => { const tx = db.transaction('cache', 'readwrite'); tx.objectStore('cache').put(value, key); tx.oncomplete = () => { db.close(); resolve() }; tx.onerror = () => { db.close(); reject(tx.error) } })
}
