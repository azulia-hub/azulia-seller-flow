import { describe,it,expect } from 'vitest'
import { emptyMetadata, type Account } from './store'
import { preparePage } from './page'
import type { BrowserJob } from '../../src/adapters/amazon-shared/contracts'

const now=1000000, owner='writer', orderId='123-1234567-1234567'
function fixture(kind:BrowserJob['kind']='finance') {
  const job:BrowserJob={id:'page',kind,scope:'selected',from:'2026-08-01T00:00:00Z',to:'2026-08-31T00:00:00Z',nextToken:null,createdAt:now,orderId}
  const meta=emptyMetadata('seller');meta.leaseOwner=owner;meta.leaseUntil=now+120000;meta.jobs=[job]
  const account:Account={meta,version:0,records:[],orders:[],catalog:[],settings:{costs:[],classificationRules:[],missingCostPolicy:'BLOCK'},settingsVersion:0,configured:true}
  return {job,account}
}
describe('shared atomic source page preparation (execution deferred)',() => {
  it('preserves unknown source values and does not complete partial coverage',() => {
    const {job,account}=fixture()
    const raw={transactionId:'tx',postedDate:'2026-08-10T12:00:00Z',unknown:{amount:'123.45',label:'new event'}}
    const prepared=preparePage(account,owner,job,{records:[raw],nextToken:'second'},now)
    expect(prepared.writes[0].value).toEqual(raw)
    expect(prepared.metadata.jobs[0].nextToken).toBe('second')
    expect(prepared.metadata.coverage).toEqual([])
    expect(account.meta.jobs[0].nextToken).toBeNull()
  })
  it('does not publish a new source revision for an identical page',() => {
    const {job,account}=fixture()
    const raw={transactionId:'tx',postedDate:'2026-08-10T12:00:00Z'}
    account.records=[raw];account.meta.revision=7
    const prepared=preparePage(account,owner,job,{records:[{...raw}],nextToken:null},now)
    expect(prepared.writes).toEqual([]);expect(prepared.metadata.revision).toBe(7)
    expect(prepared.metadata.coverage).toEqual([{from:job.from,to:job.to}])
  })
  it('rejects stale writers, stale tokens and repeated continuation tokens',() => {
    const {job,account}=fixture()
    expect(() => preparePage(account,'other',job,{nextToken:null},now)).toThrow()
    expect(() => preparePage(account,owner,{...job,nextToken:'old'},{nextToken:null},now)).toThrow()
    job.nextToken='again'
    expect(() => preparePage(account,owner,job,{nextToken:'again'},now)).toThrow()
  })
  it('holds item pages until complete and never substitutes line totals for OrderTotal',() => {
    const {job,account}=fixture('orderItems')
    account.orders=[{id:orderId,purchased:'2026-08-10T12:00:00Z',status:'Pending',fulfillmentType:'AFN',orderValue:null,currency:null}]
    const first=preparePage(account,owner,job,{orderItems:[{sku:'A',price:'120.00',quantity:3,currency:'INR'}],nextToken:'next'},now)
    expect(first.writes).toEqual([])
    const next=preparePage({...account,meta:first.metadata},owner,first.metadata.jobs[0],{orderItems:[{sku:'B',price:'50.00',quantity:1,currency:'INR'}],nextToken:null},now)
    const order=next.writes[0].value as typeof account.orders[number]
    expect(order.items).toHaveLength(2);expect(order.orderValue).toBeNull()
  })
})
