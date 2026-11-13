import { initializeHosted, syncHosted, hostedView, requestOrderDetails } from '../adapters/amazon-hosted/client'
import { snapshot } from '../adapters/amazon-hosted/cache'
import { nativeRequest } from '../adapters/device/bridge'
import { readDeviceEntry, writeDeviceEntry } from '../adapters/device/workspace'
import { calculateReading, calculationKey } from '../adapters/amazon-report-sync/calculateReading'
import { syncInventory } from '../adapters/amazon-inventory/syncInventory'
import { androidAmazon } from '../adapters/device/amazon'
import { currentPreferences, applyPreferences } from '../adapters/preferences/runtime'
import type { DeviceSettings } from '../core/settings/deviceSettings'
import { resolveTimePeriod } from '../core/analytics/timePeriods'
interface Intent { from?:string;to?:string;force?:boolean;orderIds?:string[];budgetMs?:number }
let busy=false,activeRange={from:'',to:''}
async function run(intent:Intent={}) {
  if(busy)return
  busy=true
  try {
    const saved=await readDeviceEntry<DeviceSettings>('settings')
    const settings=saved.value??{costs:[],rules:[],missingCostPolicy:'BLOCK' as const}
    applyPreferences(settings.preferences)
    await initializeHosted()
    const account=hostedView().account
    if(!account||!hostedView().connected)throw new Error('Connect Amazon to resume automatic syncing.')
    const today=new Date(Date.now()+330*60000).toISOString().slice(0,10)
    const range=intent.from&&intent.to?{from:intent.from,to:intent.to}:resolveTimePeriod(currentPreferences().defaultPeriod,today).current
    activeRange=range
    await nativeRequest('engine.phase',{phase:'fetching',message:'Checking Amazon for new and changed activity…',from:range.from,to:range.to})
    requestOrderDetails(intent.orderIds??[],range)
    await syncHosted(range,{silent:true,forceRecent:true,forceHistory:Boolean(intent.force),budgetMs:intent.budgetMs??65000})
    const source=await snapshot(account)
    const info=await nativeRequest<{revision:number;calculationKey?:string;calculatedAt?:string}>('reading.status',{account})
    const key=calculationKey(settings)
    if(info.revision!==source.revision||info.calculationKey!==key||!info.calculatedAt?.startsWith(today)) {
      await nativeRequest('engine.phase',{phase:'calculating',message:'Calculating updated results…'})
      const reading=calculateReading(source,settings)
      await nativeRequest('engine.phase',{phase:'saving',message:'Saving completed results…'})
      // Reading upload commits atomically and checks source revision before replacing anything.
      await writeDeviceEntry(`reading:${account}`,reading)
    }
    try { await nativeRequest('engine.phase',{phase:'inventory',message:'Updating stock; financial results are saved…'});const alerts=await syncInventory(account,source,{get:readDeviceEntry,put:writeDeviceEntry},(job,signal)=>androidAmazon({action:'inventory',...job},signal),Boolean(intent.force));if(alerts.length)await nativeRequest('inventory.notify',{account,alerts}) } catch { /* Financial completion is independent from optional stock access. */ }
    const error=hostedView().error
    await nativeRequest('engine.completed',{revision:source.revision,error:error||'',message:error?'Saved available data; Amazon will be checked again automatically.':hostedView().state?.jobs.some(job=>job.scope===`${range.from}/${range.to}`)?'Results saved. Remaining history continues automatically.':'Latest downloaded data and calculations are saved.'})
  } catch(cause) { await nativeRequest('engine.completed',{error:cause instanceof Error?cause.message:'Background processing will retry. Saved data is retained.'}).catch(()=>{}) }
  finally {busy=false}
}
declare global {interface Window { AzuliaBackground?:{run:(intent:Intent)=>Promise<void>;prioritize:(ids:string[])=>void} }}
window.AzuliaBackground={run,prioritize:ids=>requestOrderDetails(ids,activeRange)}
void nativeRequest('engine.ready')
