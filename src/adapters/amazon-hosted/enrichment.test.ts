import { describe, expect, it } from 'vitest'
import { enrichmentTargets, pickSyncJob } from './enrichment'
import { empty, type BrowserJob } from './cacheTypes'
import { SyncRunTracker } from '../../core/sync/planner'
import type { SourceOrderSummary } from '../amazon-report-sync/protocol'
const order=(id:string,purchased:string):SourceOrderSummary=>({id,purchased,status:'Unshipped',fulfillmentType:'AFN',orderValue:'100.00',currency:'INR',title:null,asin:null})
const job=(kind:BrowserJob['kind'],id:string):BrowserJob=>({kind,id,orderId:kind==='orderItems'?id:undefined,from:'2026-11-01',to:'2026-11-12',scope:'period',nextToken:null,createdAt:0})
describe('order metadata scheduling',()=>{
  it('prioritizes requested orders, then recent active orders, without waiting on finance jobs',()=>{
    const state=empty('account');state.jobs=[job('finance','finance')]
    const orders=[order('old','2026-10-01'),order('recent','2026-11-12'),order('requested','2026-09-01')]
    const targets=enrichmentTargets(orders,[],state,new SyncRunTracker('run'),new Set(['requested']),Date.now())
    expect(targets.items.map(item=>item.id)).toEqual(['requested','recent','old'])
    expect(orders.map(item=>item.id)).toEqual(['old','recent','requested'])
  })
  it('respects missing-metadata cooldown and discovers ASINs from line items',()=>{
    const state=empty('account'),now=Date.now(),value={...order('one','2026-11-12'),items:[{asin:'B000000001',sku:'SKU',title:'Title'}]}
    state.orderItemsChecked={one:now};state.catalogChecked={B000000001:now}
    expect(enrichmentTargets([value],[],state,new SyncRunTracker('run'),new Set(),now)).toEqual({items:[],asins:[]})
    state.catalogChecked={}
    expect(enrichmentTargets([value],[],state,new SyncRunTracker('run'),new Set(),now).asins).toEqual(['B000000001'])
  })
  it('shares ready slots with financial work and never waits behind a throttled metadata request',()=>{
    const finance=job('finance','finance'),item=job('orderItems','visible'),jobs=[finance,item],priority=new Set(['visible'])
    expect(pickSyncJob(jobs,{},0,priority,1000)).toBe(item)
    expect(pickSyncJob(jobs,{},1,priority,1000)).toBe(finance)
    expect(pickSyncJob(jobs,{orderItems:5000},0,priority,1000)).toBe(finance)
  })
})
