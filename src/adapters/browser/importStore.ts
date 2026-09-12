import type { StoredImport } from '../../core/imports/importHistory'

const databaseName = 'sellerflow-local-data'
const storeName = 'imports'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open local import storage.'))
  })
}

export async function loadImports(): Promise<StoredImport[]> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly')
    const request = transaction.objectStore(storeName).getAll()
    request.onsuccess = () => resolve((request.result as StoredImport[]).sort((left, right) => right.importedAt.localeCompare(left.importedAt)))
    request.onerror = () => reject(request.error ?? new Error('Could not load import history.'))
    transaction.oncomplete = () => database.close()
  })
}

export async function saveImport(item: StoredImport): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).put(item)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save this import locally.'))
  })
}

export async function replaceImports(items: readonly StoredImport[]): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    store.clear()
    items.forEach(item => store.put(item))
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('Could not restore report history.')) }
  })
}
