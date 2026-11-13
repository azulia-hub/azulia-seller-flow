import { missingRanges,type SyncRange } from '../sync/ranges'
import { calculateDemandMetrics } from './demand'
import type { DemandWindowDays,ShippedDayPoint } from './types'
export interface ObservedOrder {id:string;date:string;shipped:boolean;items:readonly {sku:string;quantity:number|null}[];completeItems:boolean}
/** One date/SKU index per channel; never scan the entire order set for every product/day. */
export function observedOrderDemands(orders:readonly ObservedOrder[],skus:readonly string[],coverage:readonly SyncRange[],window:DemandWindowDays,anchor:string,offsetMinutes=0){
  const end=Date.parse(`${anchor}T00:00:00Z`)-offsetMinutes*60000
  if(!Number.isFinite(end)||!Number.isFinite(offsetMinutes)||window<1)return new Map(skus.map(sku=>[sku,calculateDemandMetrics([],window)]))
  const days=new Map<number,{complete:boolean;units:Map<string,number>}>()
  for(let day=window;day>=1;day--){const start=end-day*86400000;if(!missingRanges({from:new Date(start).toISOString(),to:new Date(start+86400000).toISOString()},coverage).length)days.set(start,{complete:true,units:new Map()})}
  for(const order of orders){if(!order.shipped)continue;const time=Date.parse(order.date);if(!Number.isFinite(time))continue;const start=Math.floor((time+offsetMinutes*60000)/86400000)*86400000-offsetMinutes*60000;const day=days.get(start);if(!day)continue;if(!order.completeItems){day.complete=false;continue}for(const item of order.items){if(item.quantity!==null&&Number.isFinite(item.quantity)&&item.quantity>=0)day.units.set(item.sku,(day.units.get(item.sku)??0)+item.quantity)}}
  return new Map(skus.map(sku=>{const points:ShippedDayPoint[]=[];for(const [date,day]of days)if(day.complete)points.push({date:new Date(date+offsetMinutes*60000).toISOString().slice(0,10),shippedUnits:day.units.get(sku)??0});const result=calculateDemandMetrics(points,window);return [sku,{...result,notes:[...result.notes,'Demand uses purchase dates of orders now confirmed shipped. Actual shipment dates and historical stockouts are not yet supplied.']}] as const}))
}
export function observedOrderDemand(orders:readonly ObservedOrder[],sku:string,coverage:readonly SyncRange[],window:DemandWindowDays,anchor:string,offsetMinutes=0){return observedOrderDemands(orders,[sku],coverage,window,anchor,offsetMinutes).get(sku)!}
