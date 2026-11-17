import {expect,it} from 'vitest'
import {replacementExclusions,reviewControl,reviewCandidates,reviewPrerequisite,reviewListOrder,resolvedReviewOrders,deliveryCandidates} from './planner'
import {initialReviews,type ReviewOrder} from './types'
const order=(id:string,replaces:string|null=null):ReviewOrder=>({id,purchased:'2026-11-01T00:00:00Z',status:'Shipped',fulfillment:'marketplace',paymentReleased:true,replacement:replaces?true:false,replaces,earliestDelivery:null,latestDelivery:null,verifiedAt:null})
it('excludes the whole known chain without excluding unrelated orders',()=>{
 const value=replacementExclusions([order('A'),order('B','A'),order('C','B'),order('D')],initialReviews('seller'))
 expect(Object.keys(value.blocked).sort()).toEqual(['A','B','C'])
 expect(reviewControl(undefined,Boolean(value.blocked.C))).toMatchObject({label:'Waiting',sendable:false})
})
it('keeps verified sent history, prevents ambiguous resends and schedules only due candidates',()=>{
 const state=initialReviews('seller');state.records.A={orderId:'A',state:'sent',reason:'Accepted',nextCheck:null,checkedAt:null,sentAt:'2026-11-12',source:'manual'}
 state.records.B={orderId:'B',state:'uncertain',reason:'Uncertain',nextCheck:null,checkedAt:null}
 state.records.C={orderId:'C',state:'waiting',reason:'Waiting',nextCheck:'2026-11-20T00:00:00Z',checkedAt:null}
 expect(reviewCandidates([order('A'),order('B'),order('C'),order('D')],state,'2026-11-14T00:00:00Z').map(value=>value.id)).toEqual(['D'])
 expect(reviewControl(state.records.A,false).label).toBe('Request sent')
})

it('requires actual seller-fulfilled delivery or marketplace payment release',()=>{
 const base=order('A')
 expect(reviewPrerequisite({...base,fulfillment:'seller',status:'Shipped',latestDelivery:'2026-11-02'}).ready).toBe(false)
 expect(reviewPrerequisite({...base,fulfillment:'seller',status:'Delivered'}).ready).toBe(true)
 expect(reviewPrerequisite({...base,paymentReleased:false}).ready).toBe(false)
 expect(reviewPrerequisite({...base,status:'Pending'}).ready).toBe(false)
 expect(reviewPrerequisite({...base,status:'Unshipped'}).ready).toBe(false)
 expect(reviewPrerequisite({...base,fulfillment:'unknown'}).ready).toBe(false)
 expect(reviewListOrder({...base,paymentReleased:false},undefined)).toBe(false)
 expect(reviewListOrder({...base,paymentReleased:false},{orderId:'A',state:'sent',reason:'Accepted',checkedAt:null,nextCheck:null})).toBe(true)
})

it('uses delivered tracking rather than estimated dates and backfills missing delivery evidence',()=>{
 const seller={...order('A'),fulfillment:'seller' as const,paymentReleased:false,status:'Shipped',deliveryConfirmed:undefined}
 const state=initialReviews('seller')
 expect(reviewCandidates([seller],state,'2026-11-14T00:00:00Z')).toEqual([])
 expect(deliveryCandidates([seller],state,'2026-11-14T00:00:00Z').map(order=>order.id)).toEqual(['A'])
 state.verified.A={...seller,deliveryConfirmed:true,verifiedAt:'2026-11-14T00:00:00Z'}
 expect(reviewPrerequisite(resolvedReviewOrders([seller],state)[0]).ready).toBe(true)
 expect(reviewPrerequisite(resolvedReviewOrders([{...seller,deliveryConfirmed:false}],state)[0]).ready).toBe(false)
 expect(reviewPrerequisite({...seller,status:'Unshipped',deliveryConfirmed:true}).ready).toBe(false)
})
