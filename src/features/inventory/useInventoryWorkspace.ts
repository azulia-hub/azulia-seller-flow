import type { StockAlertState } from '../../adapters/amazon-inventory/alerts'
import { useCallback,useEffect,useRef,useState } from 'react'
import { inventoryStorage,inventoryVersion } from '../../adapters/amazon-inventory/storage'
import { initialInventorySettings,type InventorySettings,type InventoryState } from '../../adapters/amazon-inventory/workspaceTypes'
async function changed<T>(key:string,version:number){return version<0||await inventoryVersion(key)>version?inventoryStorage.get<T>(key):null}
export function useInventoryWorkspace(account:string|null){
  const [alerts,setAlerts]=useState<StockAlertState|null>(null)
  const [state,setState]=useState<InventoryState|null>(null),[settings,setSettings]=useState<InventorySettings|null>(null),[error,setError]=useState(''),[loaded,setLoaded]=useState(false)
  const accountRef=useRef(account);accountRef.current=account
  const versions=useRef({state:-1,settings:-1,alerts:-1})
  const queue=useRef<Promise<unknown>>(Promise.resolve())
  useEffect(()=>{
    let alive=true,reading=false;versions.current={state:-1,settings:-1,alerts:-1};setState(null);setSettings(null);setAlerts(null);setLoaded(false);setError('')
    if(!account)return
    const load=async()=>{if(reading)return;reading=true;try{
      const [data,config,stockAlerts]=await Promise.all([changed<InventoryState>(`inventory:${account}`,versions.current.state),changed<InventorySettings>(`inventory-config:${account}`,versions.current.settings),changed<StockAlertState>(`inventory-alerts:${account}`,versions.current.alerts)])
      if(!alive||accountRef.current!==account)return
      if(data&&data.version>versions.current.state){versions.current.state=data.version;setState(data.value)}
      if(config&&config.version>versions.current.settings){versions.current.settings=config.version;setSettings(config.value??initialInventorySettings())}
      if(stockAlerts&&stockAlerts.version>versions.current.alerts){versions.current.alerts=stockAlerts.version;setAlerts(stockAlerts.value)}
      setLoaded(true);setError('')
    }catch{if(alive)setError('Could not read saved inventory. Your existing stock and settings are retained.')}finally{reading=false}}
    void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load()},5000)
    const visible=()=>{if(document.visibilityState==='visible')void load()};document.addEventListener('visibilitychange',visible)
    return()=>{alive=false;clearInterval(timer);document.removeEventListener('visibilitychange',visible)}
  },[account])
  const save=useCallback((update:(previous:InventorySettings)=>InventorySettings)=>{
    const owner=account
    const operation=queue.current.catch(()=>{}).then(async()=>{
      if(!owner||accountRef.current!==owner)throw new Error('Seller account changed. Reopen inventory settings.')
      for(let attempt=0;attempt<3;attempt++){
        const entry=await inventoryStorage.get<InventorySettings>(`inventory-config:${owner}`)
        const next=update(entry.value??initialInventorySettings())
        try{const result=await inventoryStorage.put(`inventory-config:${owner}`,next,entry.version);if(accountRef.current===owner){setSettings(next);versions.current.settings=result.version;setError('')}return}
        catch(cause){if((cause as {status?:number}).status===409&&attempt<2)continue;throw cause}
      }
    })
    queue.current=operation;return operation.catch(cause=>{if(accountRef.current===owner)setError(cause instanceof Error?cause.message:'Could not save inventory settings.');throw cause})
  },[account])
  return {state,settings,alerts,error,loaded,save}
}
