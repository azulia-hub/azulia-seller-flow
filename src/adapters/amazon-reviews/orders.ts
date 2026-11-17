import type { SourceOrderSummary } from '../amazon-report-sync/protocol'
import type { ReviewOrder } from '../../core/review-requests/types'
type ReviewSourceOrder=SourceOrderSummary&{paymentReleased?:boolean}
/** Release evidence must be a released sale/shipment, never a refund or reimbursement. */
export function reviewOrders(orders:readonly ReviewSourceOrder[],records:readonly Record<string,unknown>[]=[]):ReviewOrder[]{
 const released=new Set<string>()
 for(const record of records){
  if(record.transactionStatus!=='RELEASED'||String(record.transactionType).toLowerCase()!=='shipment')continue
  for(const reference of Array.isArray(record.relatedIdentifiers)?record.relatedIdentifiers:[]){
   if(reference&&typeof reference==='object'&&reference.relatedIdentifierName==='ORDER_ID'&&typeof reference.relatedIdentifierValue==='string')released.add(reference.relatedIdentifierValue)
  }
 }
 return orders.map(order=>({fulfillment:['MFN','FBM'].includes(order.fulfillmentType??'')?'seller':['AFN','FBA'].includes(order.fulfillmentType??'')?'marketplace':'unknown',deliveryConfirmed:order.shipmentStatus?order.shipmentStatus==='Delivered':order.status==='Delivered'?true:undefined,paymentReleased:order.paymentReleased===true||released.has(order.id),id:order.id,purchased:order.purchased,status:order.status,replacement:order.isReplacementOrder??null,replaces:order.replacedOrderId??null,earliestDelivery:order.earliestDeliveryDate??null,latestDelivery:order.latestDeliveryDate??null,verifiedAt:order.reviewMetadataCheckedAt??null}))}
export function sourceReviewOrders(orders:readonly import('../../core/data/types').CanonicalOrder[],events:readonly import('../../core/data/types').CanonicalFinancialEvent[]=[]):ReviewSourceOrder[]{
 const released=new Set(events.filter(event=>event.event==='SALE'&&event.releaseState==='RELEASED'&&event.amountType==='PRODUCT_REVENUE'&&event.amount>0).map(event=>event.orderId))
 return orders.map(order=>({shipmentStatus:order.shipmentStatus,paymentReleased:released.has(order.orderId),id:order.orderId,purchased:order.purchaseDate,status:order.status,fulfillmentType:order.fulfillmentType,orderValue:order.orderValue,currency:order.currency,sku:order.sku,asin:order.asin,title:order.title,imageUrl:order.imageUrl,items:order.items,isReplacementOrder:order.isReplacementOrder,replacedOrderId:order.replacedOrderId,earliestDeliveryDate:order.earliestDeliveryDate,latestDeliveryDate:order.latestDeliveryDate,reviewMetadataCheckedAt:order.reviewMetadataCheckedAt}))}
