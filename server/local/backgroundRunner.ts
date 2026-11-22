import { Worker } from 'node:worker_threads'
import type { ReportSync } from './sync/coordinator.ts'
import type { DeviceStore } from './deviceStore.ts'
import { preferences } from '../../src/core/settings/preferences.ts'
import {automaticReviewDue,reviewClock} from '../../src/core/review-requests/schedule.ts'
import type {ReviewSettings} from '../../src/core/review-requests/types.ts'
export function createBackgroundCalculation(sync:ReportSync,device:DeviceStore,directory:string,credentials:import('../amazon/pilot.ts').PilotCredentials={}){
  const worker=new Worker(new URL('./backgroundWorker.ts',import.meta.url),{workerData:{directory,credentials,engine:new URL('../../.local/engine/engine.mjs',import.meta.url).href}})
  let busy=false,stopped=false,last=0,lastRevision=-1,force=true,inventoryForce=false,reviewsPending=false,reviewWakeDay='',error:string|null=null
  function tick(){
    if(stopped||busy)return
    const config=preferences((device.get('settings').value as {preferences?:unknown}|null)?.preferences)
    sync.configure(config.syncMinutes)
    const status=sync.status(),revision=status.revision
    const now=new Date().toISOString(),day=reviewClock(now).date
    const reviewDue=reviewWakeDay!==day&&automaticReviewDue(device.get(`reviews-config:${status.connectionKey}`).value as ReviewSettings|null,now)
    if(revision===0&&!status.lastSync)return
    if(!force&&!reviewDue&&((revision===lastRevision&&Date.now()-last<(reviewsPending?15000:config.syncMinutes*60000))||revision!==lastRevision&&Date.now()-last<1500))return
    if(reviewDue)reviewWakeDay=day
    busy=true;force=false;last=Date.now();lastRevision=revision
    worker.postMessage({snapshot:sync.snapshot(),forceInventory:inventoryForce});inventoryForce=false
  }
  worker.on('message',message=>{if(message.optional){reviewsPending=message.reviewsPending===true;return}busy=false;if(typeof message.reviewsPending==='boolean')reviewsPending=message.reviewsPending;if(!message.ok)lastRevision=-1;error=message.ok?null:'Saved data is retained; background calculations will retry.'})
  worker.on('error',()=>{busy=false;error='Background calculation worker stopped. Run npm run build and restart the local server; saved data is retained.';stopped=true})
  const timer=setInterval(tick,3000);tick()
  return {request(){force=true;inventoryForce=true;tick()},status(){return{busy,error}},async close(){stopped=true;clearInterval(timer);await worker.terminate()}}
}
export type BackgroundCalculation=ReturnType<typeof createBackgroundCalculation>
