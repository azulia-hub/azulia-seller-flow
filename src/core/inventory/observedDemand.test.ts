import { expect,it } from 'vitest'
import { observedOrderDemands } from './observedDemand'
import { computeReplenishment,DEFAULT_REPLENISHMENT_CONFIG } from './replenishment'
import type { CanonicalInventoryItem } from './types'
it('counts covered zero-shipment days without treating missing metadata as zero demand',()=>{
  const coverage=[{from:'2026-11-01T00:00:00Z',to:'2026-11-08T00:00:00Z'}]
  const result=observedOrderDemands([{id:'A',date:'2026-11-02',shipped:true,completeItems:true,items:[{sku:'SKU',quantity:7}]},{id:'B',date:'2026-11-03',shipped:false,completeItems:true,items:[{sku:'SKU',quantity:20}]}],['SKU'],coverage,7,'2026-11-08').get('SKU')!
  expect(result.totalShippedUnits).toBe(7);expect(result.observedDays).toBe(7);expect(result.dailyDemand).toBe(1)
  const missing=observedOrderDemands([{id:'A',date:'2026-11-02',shipped:true,completeItems:false,items:[]}],['SKU'],coverage,7,'2026-11-08').get('SKU')!
  expect(missing.observedDays).toBe(6)
})
it('uses explicit manual physical stock without substituting advertised quantity or subtracting reservations twice',()=>{
  const item:CanonicalInventoryItem={id:'x',sellerAccount:'a',marketplace:'m',sku:'SKU',fulfillmentChannel:'merchant',stockBasis:'MANUAL_PHYSICAL',updatedAt:'2026-11-08',provenance:{source:'fixture',observedAt:'2026-11-08'},quantities:{available:null,listed:999,manualPhysical:10,reserved:3,inbound:null,unsellable:null}}
  const demand=observedOrderDemands([],['SKU'],[{from:'2026-11-01T00:00:00Z',to:'2026-11-08T00:00:00Z'}],7,'2026-11-08').get('SKU')!
  expect(computeReplenishment(item,demand,DEFAULT_REPLENISHMENT_CONFIG,'2026-11-08').usableStock).toBe(10)
  expect(computeReplenishment({...item,quantities:{...item.quantities,manualPhysical:null}},demand,DEFAULT_REPLENISHMENT_CONFIG,'2026-11-08').urgency).toBe('UNAVAILABLE')
})
