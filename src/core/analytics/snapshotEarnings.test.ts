import { it, expect } from 'vitest'
import { computePulseScoreboard } from './pulseScoreboard'
import type { CanonicalFinancialEvent } from '../data/types'
const base:CanonicalFinancialEvent={id:'sale',source:'example',sourceDatasetId:'test',sourceRow:1,date:'2026-11-01',orderPurchaseDate:'2026-11-01',orderId:'order-1',sku:'sku',quantity:1,event:'SALE',amountType:'PRODUCT_REVENUE',amount:499,amountClass:'OPERATING',classified:true,status:'Deferred',state:null,city:null,rawType:'Order',rawDescription:null,raw:{}}
const calc=(events:CanonicalFinancialEvent[])=>computePulseScoreboard({events,costs:[],missingCostPolicy:'ASSUME_ZERO',anchorDate:'2026-11-13'}).thisMonth
it('keeps original gross after a later refund and nets fees, fee credits and reimbursement once',()=>{
 const events=[base,
  {...base,id:'refund',sourceRow:2,date:'2026-12-01',event:'REFUND' as const,rawType:'Refund',amount:-499},
  {...base,id:'commission',sourceRow:3,date:'2026-12-01',event:'FEE' as const,amountType:'COMMISSION' as const,amount:-50,quantity:0},
  {...base,id:'shipping',sourceRow:4,event:'FEE' as const,amountType:'SHIPPING_FEE' as const,amount:-40,quantity:0},
  {...base,id:'fee-credit',sourceRow:5,event:'FEE' as const,amountType:'COMMISSION' as const,amount:50,quantity:0},
  {...base,id:'reimbursement',sourceRow:6,date:'2026-12-02',event:'REIMBURSEMENT' as const,amountType:'OTHER' as const,amount:20,quantity:0},
 ]
 const result=calc(events)
 expect(result.grossSales).toBe(499);expect(result.netEarnings).toBe(-20);expect(result.netProfit).toBe(-20)
 expect(result.financialRows.reduce((sum,row)=>sum+row.value,0)).toBe(-20)
})
it('excludes API orders with unknown or outside-period purchase dates, while retaining unlinked account fees by posting date',()=>{
 const result=calc([{...base,orderPurchaseDate:null},{...base,id:'old',orderId:'old-order',orderPurchaseDate:'2026-10-01'},{...base,id:'account',orderId:null,event:'FEE',amountType:'OTHER_FEE',amount:-10,quantity:0}])
 expect(result.grossSales).toBe(0);expect(result.netEarnings).toBe(-10);expect(result.excludedOrderRecords).toBe(2)
})
it('never adds pending estimates into recorded gross or earnings and hides incomplete profit',()=>{
 const result=computePulseScoreboard({events:[base],costs:[],missingCostPolicy:'BLOCK',anchorDate:'2026-11-13',estimateMissingPrices:true,sourceOrders:[{orderId:'new',purchaseDate:'2026-11-13',status:'Pending',sku:'sku'}]}).today
 expect(result.grossSales).toBe(0);expect(result.netEarnings).toBe(0);expect(result.pendingSales).toBeGreaterThan(0);expect(result.estimatedPendingSales).toBe(result.pendingSales)
 const withSale=computePulseScoreboard({events:[base],costs:[],missingCostPolicy:'BLOCK',anchorDate:'2026-11-13'}).thisMonth
 expect(withSale.profitReady).toBe(false)
})
it('applies customer-tax display consistently and leaves source events unchanged',()=>{
 const tax={...base,id:'tax',sourceRow:2,amountType:'TAX' as const,amount:90,quantity:0}
 const result=computePulseScoreboard({events:[base,tax],costs:[],missingCostPolicy:'ASSUME_ZERO',anchorDate:'2026-11-13',includeCustomerTax:false}).thisMonth
 expect(result.grossSales).toBe(499);expect(result.netEarnings).toBe(499);expect(result.netProfit).toBe(499);expect(tax.amount).toBe(90)
})
