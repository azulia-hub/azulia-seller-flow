import type { DemandMetrics } from '../../core/inventory/types'
import type { CanonicalOrder } from '../../core/data/types'
import type { SyncRange } from '../../core/sync/ranges'
import { observedOrderDemands } from '../../core/inventory/observedDemand'
import { computeReplenishment } from '../../core/inventory/replenishment'
import { initialInventorySettings,type InventoryState,type InventorySettings } from './workspaceTypes'
export function inventoryViewModel(state:InventoryState|null,settings:InventorySettings|null,orders:readonly CanonicalOrder[],coverage:readonly SyncRange[],today:string){
  const config=settings??initialInventorySettings()
  const items=(state?.items??[]).map(item=>{
    const override=config.overrides[item.id]
    return {...item,quantities:{...item.quantities,manualPhysical:override?.physical??null}}
  })
  const channelOrders=new Map<string,CanonicalOrder[]>()
  for(const order of orders){const channel=order.fulfillmentType==='AFN'?'FBA':order.fulfillmentType==='MFN'?'FBM':order.fulfillmentType??'';const rows=channelOrders.get(channel)??[];rows.push(order);channelOrders.set(channel,rows)}
  const demands=new Map<string,DemandMetrics>()
  for(const channel of new Set(items.map(item=>item.fulfillmentChannel))){
    const skus=items.filter(item=>item.fulfillmentChannel===channel).map(item=>item.sku)
    const observed=(channelOrders.get(channel)??[]).map(order=>({id:order.orderId,date:order.purchaseDate,shipped:order.status==='Shipped'||order.status==='Delivered',items:(order.items??[]).filter(value=>value.sku).map(value=>({sku:value.sku!,quantity:value.quantity??null})),completeItems:Boolean(order.items?.length)&&order.items!.every(value=>Boolean(value.sku)&&value.quantity!==undefined&&value.quantity!==null&&Number.isFinite(value.quantity))}))
    const values=observedOrderDemands(observed,skus,coverage,config.windowDays,today,330)
    for(const item of items)if(item.fulfillmentChannel===channel)demands.set(item.id,values.get(item.sku)!)
  }
  const recommendations=items.map(item=>computeReplenishment(item,demands.get(item.id)!,config.overrides[item.id]?.config??{},`${today}T00:00:00+05:30`))
  return {items,demands,recommendations}
}
