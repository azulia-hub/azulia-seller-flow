import { parentPort,workerData } from 'node:worker_threads'
import { openDeviceStore } from './deviceStore.ts'
import { preferences } from '../../src/core/settings/preferences.ts'
const device=await openDeviceStore(workerData.directory)
const engine=await import(workerData.engine)
let optionalBusy=false, pendingInventoryForce=false
parentPort!.on('message',async ({snapshot,forceInventory})=>{
  pendingInventoryForce ||= Boolean(forceInventory)
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
    // Publish completed readings immediately. Network-bound optional work must not
    // hold the coordinator's financial delivery lock for another several minutes.
    parentPort!.postMessage({ok:true,interval:preferences(settings.preferences).syncMinutes})
    if(optionalBusy)return
    optionalBusy=true
    try {
      const storage={get:async(key:string)=>device.get(key),put:async(key:string,value:unknown,version?:number)=>device.put(key,value,version)}
      let reviewsPending=false
      try { reviewsPending=(await engine.runReviewCycle(storage,{account:snapshot.connectionKey,orders:engine.reviewOrders(snapshot.orders??[],snapshot.records),freshOrdersAt:snapshot.ordersCheckedAt??null},engine.createReviewTransport(workerData.credentials))).pending } catch { /* Review failures never invalidate saved readings. */ }
      parentPort!.postMessage({optional:true,reviewsPending})
      if(!reviewsPending){
        const force=pendingInventoryForce;pendingInventoryForce=false
        try { await engine.syncInventory(snapshot.connectionKey,snapshot,storage,engine.createInventoryReader(workerData.credentials),force) } catch { /* Optional inventory failures never block completed readings. */ }
      }
    } finally {optionalBusy=false}

  }catch{parentPort!.postMessage({ok:false})}
})
