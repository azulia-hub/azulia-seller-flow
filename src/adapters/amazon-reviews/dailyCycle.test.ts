import {afterEach,expect,it,vi} from 'vitest'
import {runReviewCycle,sendReview} from './service'
import {initialReviews,initialReviewSettings,type ReviewWorkspace,type ReviewOrder} from '../../core/review-requests/types'
import type {InventoryStorage} from '../amazon-inventory/workspaceTypes'
const account='daily-test'
function fixture(count=5){
 const map=new Map<string,{version:number;value:unknown}>()
 const storage:InventoryStorage={async get<T>(key:string){const entry=map.get(key);return {version:entry?.version??0,value:entry?structuredClone(entry.value) as T:null}},async put(key,value,version){const previous=map.get(key);if(version!==undefined&&version!==(previous?.version??0))throw Object.assign(new Error('Conflict'),{status:409});const next=(previous?.version??0)+1;map.set(key,{version:next,value:structuredClone(value)});return {version:next}}}
 const orders:ReviewOrder[]=Array.from({length:count},(_,i)=>({id:`order-${i}`,purchased:'2026-11-01T00:00:00Z',status:'Delivered',fulfillment:'marketplace',paymentReleased:true,replacement:false,replaces:null,earliestDelivery:null,latestDelivery:null,verifiedAt:null}))
 const context=()=>({account,orders,freshOrdersAt:new Date().toISOString()})
 const transport={order:vi.fn(async(id:string)=>orders.find(order=>order.id===id)!),eligible:vi.fn(async()=>true),submit:vi.fn(async()=>{})}
 return {storage,orders,context,transport}
}
afterEach(()=>vi.useRealTimers())
async function cycle(f:ReturnType<typeof fixture>,notify=vi.fn(async()=>true)){
 const promise=runReviewCycle(f.storage,f.context(),f.transport,notify)
 await vi.advanceTimersByTimeAsync(35000)
 return {result:await promise,notify}
}
it('does not send before the daily time, then processes all eligible orders rather than two',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-15T09:22:00Z'))
 const f=fixture()
 await f.storage.put(`reviews-config:${account}`,{...initialReviewSettings(),autoEnabled:true},0)
 await cycle(f);expect(f.transport.submit).not.toHaveBeenCalled()
 // Earlier eligibility cooldowns must not cause the daily queue to miss ready orders.
 vi.setSystemTime(new Date('2026-11-15T09:23:00Z'))
 const {result,notify}=await cycle(f)
 expect(result.pending).toBe(false);expect(f.transport.submit).toHaveBeenCalledTimes(5)
 expect(notify).toHaveBeenCalledWith(expect.objectContaining({count:5,account}))
 await cycle(f,notify);expect(f.transport.submit).toHaveBeenCalledTimes(5);expect(notify).toHaveBeenCalledOnce()
})
it('resumes a large durable queue across bounded cycles, updates one cumulative notification',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-15T09:23:00Z'))
 const f=fixture(30),notify=vi.fn(async()=>true)
 await f.storage.put(`reviews-config:${account}`,{...initialReviewSettings(),autoEnabled:true},0)
 expect((await cycle(f,notify)).result.pending).toBe(true)
 expect(notify).toHaveBeenCalledOnce()
 const first=f.transport.submit.mock.calls.length;expect(first).toBeGreaterThan(2);expect(first).toBeLessThan(30)
 await cycle(f,notify);expect(f.transport.submit).toHaveBeenCalledTimes(30);expect(notify).toHaveBeenCalledTimes(2)
 const state=(await f.storage.get<ReviewWorkspace>(`reviews:${account}`)).value!
 expect(state.dailyRun?.remaining).toEqual([])
})
it('retains uncertain guards, does not notify for rejection, and does not replay a POST',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-15T09:23:00Z'))
 const f=fixture(1);f.transport.submit.mockRejectedValue(new Error('Timeout'))
 await f.storage.put(`reviews-config:${account}`,{...initialReviewSettings(),autoEnabled:true},0)
 const {notify}=await cycle(f)
 expect(notify).not.toHaveBeenCalled()
 expect((await f.storage.get<ReviewWorkspace>(`reviews:${account}`)).value?.records['order-0'].state).toBe('uncertain')
 await cycle(f,notify);expect(f.transport.submit).toHaveBeenCalledOnce()
})
it('honours a schedule change before automatic dispatch while manual sends stay available',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-15T09:23:00Z'))
 const f=fixture(1),workspace=initialReviews(account)
 workspace.records['order-0']={orderId:'order-0',state:'eligible',reason:'Eligible',checkedAt:null,nextCheck:null}
 await f.storage.put(`reviews:${account}`,workspace,0)
 await f.storage.put(`reviews-config:${account}`,{...initialReviewSettings(),autoEnabled:true,dailyTime:'16:00'},0)
 await expect(sendReview(f.storage,f.context(),'order-0',f.transport,'automatic',new AbortController().signal,workspace)).rejects.toThrow('Waiting for the daily')
 await sendReview(f.storage,f.context(),'order-0',f.transport,'manual',new AbortController().signal,workspace)
 expect(f.transport.submit).toHaveBeenCalledOnce()
})
it('retries an unavailable notification without resending accepted requests',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-15T09:23:00Z'))
 const f=fixture(1),notify=vi.fn(async()=>false)
 await f.storage.put(`reviews-config:${account}`,{...initialReviewSettings(),autoEnabled:true},0)
 await cycle(f,notify);expect(f.transport.submit).toHaveBeenCalledOnce()
 notify.mockResolvedValue(true)
 await cycle(f,notify);expect(notify).toHaveBeenCalledTimes(2)
 await cycle(f,notify);expect(notify).toHaveBeenCalledTimes(2);expect(f.transport.submit).toHaveBeenCalledOnce()
})
it('waits until the next daily time for newly arrived orders and preserves yesterday sent history',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-15T09:23:00Z'))
 const f=fixture(1)
 await f.storage.put(`reviews-config:${account}`,{...initialReviewSettings(),autoEnabled:true},0)
 await cycle(f)
 f.orders.push({...f.orders[0],id:'new-order'})
 await cycle(f);expect(f.transport.submit).toHaveBeenCalledOnce()
 vi.setSystemTime(new Date('2026-11-16T09:22:00Z'));await cycle(f);expect(f.transport.submit).toHaveBeenCalledOnce()
 vi.setSystemTime(new Date('2026-11-16T09:23:00Z'));await cycle(f);expect(f.transport.submit).toHaveBeenCalledTimes(2)
})
it('stops after automation is switched off during a fresh eligibility check',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-15T09:23:00Z'))
 const f=fixture(2)
 await f.storage.put(`reviews-config:${account}`,{...initialReviewSettings(),autoEnabled:true},0)
 f.transport.eligible.mockImplementation(async()=>{const entry=await f.storage.get(`reviews-config:${account}`);await f.storage.put(`reviews-config:${account}`,initialReviewSettings(),entry.version);return true})
 await cycle(f);expect(f.transport.submit).not.toHaveBeenCalled()
})
it('continues a large queue when the notification bridge rejects, then retries the accepted-count summary',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-15T09:23:00Z'))
 const f=fixture(30),notify=vi.fn(async():Promise<boolean>=>{throw new Error('Unsupported background capability.')})
 await f.storage.put(`reviews-config:${account}`,{...initialReviewSettings(),autoEnabled:true},0)
 const first=await cycle(f,notify)
 expect(first.result.pending).toBe(true)
 const count=f.transport.submit.mock.calls.length
 expect(count).toBeGreaterThan(0);expect(count).toBeLessThan(30)
 expect((await f.storage.get<ReviewWorkspace>(`reviews:${account}`)).value?.dailyRun?.notifiedCount).toBeUndefined()
 notify.mockResolvedValue(true)
 await cycle(f,notify)
 expect(f.transport.submit).toHaveBeenCalledTimes(30)
 expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({count:30}))
 await cycle(f,notify);expect(f.transport.submit).toHaveBeenCalledTimes(30)
})
