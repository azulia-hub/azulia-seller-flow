import { androidDevice,nativeRequest } from '../device/bridge'
import { persistentDevice,readDeviceEntry,writeDeviceEntry } from '../device/workspace'
import type { InventoryStorage } from './workspaceTypes'
let database:Promise<IDBDatabase>|undefined
function open(){return database??=new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('azulia-inventory-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('workspace');request.onsuccess=()=>resolve(request.result);request.onerror=()=>{database=undefined;reject(request.error)}})}
export const inventoryStorage:InventoryStorage={
  async get<T>(key:string){if(persistentDevice)return readDeviceEntry<T>(key);const db=await open();return new Promise<{version:number;value:T|null}>((resolve,reject)=>{const transaction=db.transaction('workspace','readonly'),request=transaction.objectStore('workspace').get(key);request.onsuccess=()=>resolve(request.result??{version:0,value:null});request.onerror=()=>reject(request.error)})},
  async put(key,value,version){
    if(persistentDevice)return writeDeviceEntry(key,value,version)
    const db=await open();return new Promise<{version:number}>((resolve,reject)=>{
      const transaction=db.transaction('workspace','readwrite'),store=transaction.objectStore('workspace'),request=store.get(key);let next=0
      request.onsuccess=()=>{const old=request.result??{version:0};if(version!==undefined&&version!==old.version){transaction.abort();return}next=old.version+1;store.put({version:next,value},key);store.put(next,`head:${key}`)}
      transaction.oncomplete=()=>resolve({version:next});transaction.onabort=()=>reject(Object.assign(new Error('Inventory settings changed elsewhere. Please retry.'),{status:409}));transaction.onerror=()=>reject(transaction.error)
    })
  },
}

export async function inventoryVersion(key:string):Promise<number>{
  if(androidDevice)return (await nativeRequest<{version:number}>('workspace.head',{key})).version
  if(persistentDevice){const response=await fetch(`/api/device/workspace?key=${encodeURIComponent(key)}&head=1`,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Inventory status unavailable.');return (await response.json()).version}
  const db=await open();return new Promise((resolve,reject)=>{const transaction=db.transaction('workspace','readonly'),request=transaction.objectStore('workspace').get(`head:${key}`);request.onsuccess=()=>resolve(request.result??0);request.onerror=()=>reject(request.error)})
}
