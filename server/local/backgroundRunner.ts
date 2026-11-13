import { Worker } from 'node:worker_threads'
import type { ReportSync } from './sync/coordinator.ts'
import type { DeviceStore } from './deviceStore.ts'
import { preferences } from '../../src/core/settings/preferences.ts'
export function createBackgroundCalculation(sync:ReportSync,device:DeviceStore,directory:string,credentials:import('../amazon/pilot.ts').PilotCredentials={}){
  const worker=new Worker(new URL('./backgroundWorker.ts',import.meta.url),{workerData:{directory,credentials,engine:new URL('../../.local/engine/engine.mjs',import.meta.url).href}})
  let busy=false,stopped=false,last=0,lastRevision=-1,force=true,inventoryForce=false,error:string|null=null
  function tick(){
    if(stopped||busy)return
    const config=preferences((device.get('settings').value as {preferences?:unknown}|null)?.preferences)
    sync.configure(config.syncMinutes)
    const status=sync.status(),revision=status.revision
    if(revision===0&&!status.lastSync)return
    if(!force&&((revision===lastRevision&&Date.now()-last<15*60000)||Date.now()-last<15000))return
    busy=true;force=false;last=Date.now();lastRevision=revision
    worker.postMessage({snapshot:sync.snapshot(),forceInventory:inventoryForce});inventoryForce=false
  }
  worker.on('message',message=>{busy=false;if(!message.ok)lastRevision=-1;error=message.ok?null:'Saved data is retained; background calculations will retry.'})
  worker.on('error',()=>{busy=false;error='Background calculation worker stopped. Run npm run build and restart the local server; saved data is retained.';stopped=true})
  const timer=setInterval(tick,3000);tick()
  return {request(){force=true;inventoryForce=true;tick()},status(){return{busy,error}},async close(){stopped=true;clearInterval(timer);await worker.terminate()}}
}
export type BackgroundCalculation=ReturnType<typeof createBackgroundCalculation>
