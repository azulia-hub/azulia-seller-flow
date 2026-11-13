import type { SyncSnapshot } from '../amazon-report-sync/protocol'
import type { CanonicalOrder } from '../../core/data/types'
import { inventoryViewModel } from './viewModel'
import { initialInventorySettings,type InventorySettings,type InventoryState,type InventoryStorage } from './workspaceTypes'
export interface StockAlert {id:string;itemId:string;sku:string;title:string;status:string;at:string;quantity:number|null}
export interface StockAlertState {statuses:Record<string,string>;events:StockAlert[]}
/** Persisted transition identities prevent repeated alerts for unchanged low stock. */
export async function updateStockAlerts(account:string,source:SyncSnapshot,storage:InventoryStorage):Promise<StockAlert[]> {
  const [stock,config,previous]=await Promise.all([storage.get<InventoryState>(`inventory:${account}`),storage.get<InventorySettings>(`inventory-config:${account}`),storage.get<StockAlertState>(`inventory-alerts:${account}`)])
  if(!stock.value)return []
  const settings=config.value??initialInventorySettings(),today=new Date(Date.now()+330*60000).toISOString().slice(0,10)
  const orders:CanonicalOrder[]=(source.orders??[]).map(order=>({orderId:order.id,purchaseDate:order.purchased,status:order.status,fulfillmentType:order.fulfillmentType,orderValue:order.orderValue,currency:order.currency,items:order.items}))
  const model=inventoryViewModel(stock.value,settings,orders,source.purchaseCoverage??[],today),old=previous.value??{statuses:{},events:[]},statuses={...old.statuses},events=[...old.events]
  for(let i=0;i<model.items.length;i++){
    const item=model.items[i],rec=model.recommendations[i]
    const sourceName=item.fulfillmentChannel==='FBA'?'fba':'listings',observed=stock.value.sources[sourceName]
    if(!observed?.complete||!observed.lastSuccess||Date.now()-Date.parse(observed.lastSuccess)>30*60000)continue
    // Unknown demand must not reset a previously established warning, or produce repeated false transitions.
    if(rec.urgency==='UNAVAILABLE')continue
    if(settings.notifyLowStock&&old.statuses[item.id]&&old.statuses[item.id]!==rec.urgency&&['OUT_OF_STOCK','CRITICAL_REORDER','REORDER_SOON'].includes(rec.urgency))events.push({id:crypto.randomUUID(),itemId:item.id,sku:item.sku,title:item.title??item.sku,status:rec.urgency,quantity:rec.suggestedQuantity,at:new Date().toISOString()})
    statuses[item.id]=rec.urgency
  }
  const next={statuses,events:events.slice(-100)}
  if(JSON.stringify(next)!==JSON.stringify(old))await storage.put(`inventory-alerts:${account}`,next,previous.version)
  return settings.notifyLowStock?next.events.slice(-10):[]
}
