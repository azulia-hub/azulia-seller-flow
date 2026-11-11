import { describe,it,expect } from 'vitest'
import { computePulseScoreboard } from './pulseScoreboard'
import type { CanonicalFinancialEvent } from '../data/types'
const order={orderId:'order',purchaseDate:'2026-11-11',status:'Unshipped',orderValue:'3913.00',currency:'INR',sku:'SKU'}
const sale:CanonicalFinancialEvent={id:'financial',source:'amazon',sourceDatasetId:'source',sourceRow:1,date:'2026-11-12',orderPurchaseDate:'2026-11-11',amount:3359,amountClass:'OPERATING',amountType:'PRODUCT_REVENUE',event:'SALE',orderId:'order',sku:'SKU',quantity:1,state:null,city:null,status:null,rawType:'Order',rawDescription:null,raw:{},classified:true}
const input={costs:[],missingCostPolicy:'BLOCK' as const,salesBasis:'ORDERED' as const,anchorDate:'2026-11-11',sourceOrders:[order]}
describe('recorded order value (execution deferred)',() => {
  it('does not change ordered value when financial revenue arrives',() => {
    expect(computePulseScoreboard({...input,events:[]}).today.totalSales).toBe(3913)
    expect(computePulseScoreboard({...input,events:[sale]}).today.totalSales).toBe(3913)
  })
  it('does not guess missing totals from old SKU prices or incomplete item amounts',() => {
    const missing={...order,orderValue:null,items:[{sku:'SKU',price:'120.00',quantity:3,currency:'INR'}]}
    const result=computePulseScoreboard({...input,events:[sale],sourceOrders:[missing]}).today
    expect(result.totalSales).toBe(0);expect(result.missingValueOrders).toBe(1)
    expect(result.orders[0].isValueMissing).toBe(true)
  })
  it('excludes canceled orders and unknown purchase dates from ordered totals',() => {
    const result=computePulseScoreboard({...input,sourceOrders:[{...order,status:'Canceled'}],events:[{...sale,orderId:'unknown',orderPurchaseDate:null,date:'2026-11-11'}]}).today
    expect(result.totalSales).toBe(0);expect(result.orders.some(value => value.orderId==='unknown')).toBe(false)
  })
})
