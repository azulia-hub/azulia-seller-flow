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

export async function loadImports(includeAutomatic=true): Promise<StoredImport[]> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly')
    const store=transaction.objectStore(storeName)
    const sorted=(items:StoredImport[])=>resolve(items.sort((left,right)=>right.importedAt.localeCompare(left.importedAt)))
    if(!includeAutomatic){
      const keys=store.getAllKeys();keys.onerror=()=>reject(keys.error)
      keys.onsuccess=()=>{const wanted=keys.result.filter(key=>typeof key!=='string'||!key.startsWith('api:'));if(!wanted.length){sorted([]);return}const items:StoredImport[]=[];let remaining=wanted.length;for(const key of wanted){const entry=store.get(key);entry.onsuccess=()=>{if(entry.result)items.push(entry.result);if(--remaining===0)sorted(items)};entry.onerror=()=>reject(entry.error)}}
      transaction.oncomplete=()=>database.close();return
    }
    const request=store.getAll()
    request.onsuccess=()=>sorted(request.result as StoredImport[])
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
