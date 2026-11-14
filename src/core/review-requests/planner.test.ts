import {expect,it} from 'vitest'
import {replacementExclusions,reviewControl,reviewCandidates} from './planner'
import {initialReviews,type ReviewOrder} from './types'
const order=(id:string,replaces:string|null=null):ReviewOrder=>({id,purchased:'2026-11-01T00:00:00Z',status:'Shipped',replacement:replaces?true:false,replaces,earliestDelivery:null,latestDelivery:null,verifiedAt:null})
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
