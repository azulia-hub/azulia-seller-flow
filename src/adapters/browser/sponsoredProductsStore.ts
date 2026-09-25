import type { SponsoredProductsReport } from '../../core/advertising/types'

const databaseName = 'sellerflow-sponsored-products'
const storeName = 'reports'
const activeKey = 'active'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open advertising report storage.'))
  })
}

export async function loadSponsoredProductsReport(): Promise<SponsoredProductsReport | null> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly')
    const request = transaction.objectStore(storeName).get(activeKey)
    request.onsuccess = () => resolve((request.result as SponsoredProductsReport | undefined) ?? null)
    request.onerror = () => reject(request.error ?? new Error('Could not load the advertising report.'))
    transaction.oncomplete = () => database.close()
  })
}

export async function saveSponsoredProductsReport(report: SponsoredProductsReport): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).put(report, activeKey)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('Could not save the advertising report.')) }
  })
}

