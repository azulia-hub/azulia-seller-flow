import {it,expect} from 'vitest'
import {reviewOrders} from './orders'
import type {SourceOrderSummary} from '../amazon-report-sync/protocol'
const order:SourceOrderSummary={id:'order',purchased:'2026-11-01',status:'Shipped',fulfillmentType:'AFN',orderValue:null,currency:'INR'}
const record=(type:string,status:string)=>({transactionType:type,transactionStatus:status,relatedIdentifiers:[{relatedIdentifierName:'ORDER_ID',relatedIdentifierValue:'order'}]})
it('requires released shipment evidence; refunds and deferred sales do not complete payment',()=>{
 expect(reviewOrders([order],[record('Shipment','DEFERRED'),record('Refund','RELEASED')])[0]).toMatchObject({fulfillment:'marketplace',paymentReleased:false})
 expect(reviewOrders([order],[record('Shipment','RELEASED')])[0].paymentReleased).toBe(true)
 expect(reviewOrders([{...order,fulfillmentType:'MFN'}])[0].fulfillment).toBe('seller')
})

it('maps Easy Ship delivery independently from order shipped status',()=>{
 expect(reviewOrders([{...order,fulfillmentType:'MFN',shipmentStatus:'Delivered'}])[0].deliveryConfirmed).toBe(true)
 for(const status of ['PickedUp','OutForDelivery','ReturnedToSeller','Undeliverable'])expect(reviewOrders([{...order,fulfillmentType:'MFN',shipmentStatus:status}])[0].deliveryConfirmed).toBe(false)
 expect(reviewOrders([{...order,fulfillmentType:'MFN',latestDeliveryDate:'2026-11-01'}])[0].deliveryConfirmed).toBeUndefined()
})
