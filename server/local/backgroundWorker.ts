import { parentPort,workerData } from 'node:worker_threads'
import { openDeviceStore } from './deviceStore.ts'
import { preferences } from '../../src/core/settings/preferences.ts'
const device=await openDeviceStore(workerData.directory)
const engine=await import(workerData.engine)
parentPort!.on('message',async ({snapshot,forceInventory})=>{
  try {
    const settings=device.get('settings').value??{costs:[],rules:[],missingCostPolicy:'BLOCK'}
    const info=device.readingStatus(snapshot.connectionKey)
    const today=new Date(Date.now()+330*60000).toISOString().slice(0,10)
    const key=engine.calculationKey(settings)
    if(info.revision!==snapshot.revision||info.calculationKey!==key||!info.calculatedAt?.startsWith(today)){
      const version=device.encoded(`reading:${snapshot.connectionKey}`).version
      const reading=engine.calculateReading(snapshot,settings)
      device.put(`reading:${snapshot.connectionKey}`,reading,version)
    }
    try { await engine.syncInventory(snapshot.connectionKey,snapshot,{get:async(key:string)=>device.get(key),put:async(key:string,value:unknown,version?:number)=>device.put(key,value,version)},engine.createInventoryReader(workerData.credentials),Boolean(forceInventory)) } catch { /* Optional inventory failures never block completed financial readings. */ }
    parentPort!.postMessage({ok:true,interval:preferences(settings.preferences).syncMinutes})
  }catch{parentPort!.postMessage({ok:false})}
})
