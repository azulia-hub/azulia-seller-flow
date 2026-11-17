import {expect,it} from 'vitest'
import {automaticReviewDue,reviewClock,reviewTime,validReviewTime,dailyReviewAccepted} from './schedule'
import {initialReviews,initialReviewSettings} from './types'
it('defaults legacy/invalid times to 14:53 and accepts only 24-hour minute values',()=>{
 expect(reviewTime(undefined)).toBe('14:53')
 expect(reviewTime({...initialReviewSettings(),dailyTime:'25:00'})).toBe('14:53')
 for(const value of ['00:00','14:53','23:59'])expect(validReviewTime(value)).toBe(true)
 for(const value of ['9:00','24:00','14:60','',null])expect(validReviewTime(value)).toBe(false)
})
it('uses IST boundaries regardless of the host timezone and requires consent',()=>{
 const config={...initialReviewSettings(),autoEnabled:true}
 expect(automaticReviewDue(config,'2026-11-16T09:22:59Z')).toBe(false)
 expect(automaticReviewDue(config,'2026-11-16T09:23:00Z')).toBe(true)
 expect(automaticReviewDue(config,'2026-11-16T18:29:59Z')).toBe(true)
 expect(automaticReviewDue(config,'2026-11-16T18:30:00Z')).toBe(false)
 expect(reviewClock('2026-11-16T18:30:00Z')).toEqual({date:'2026-11-17',time:'00:00'})
 expect(automaticReviewDue(initialReviewSettings(),'2026-11-16T09:23:00Z')).toBe(false)
 expect(automaticReviewDue({...config,dailyTime:'16:00'},'2026-11-16T09:23:00Z')).toBe(false)
})
it('counts only confirmed automatic requests belonging to the daily queue',()=>{
 const value=initialReviews('a'),run={date:'2026-11-16',time:'14:53',startedAt:'2026-11-16T09:23:00Z',orderIds:['a','b','c','d'],remaining:[]}
 for(const id of run.orderIds)value.records[id]={orderId:id,state:'sent',source:'automatic',sentAt:'2026-11-16T09:24:00Z',checkedAt:null,nextCheck:null,reason:'Accepted'}
 value.records.b.state='uncertain';value.records.c.source='manual';value.records.d.sentAt='2026-11-15T09:24:00Z'
 expect(dailyReviewAccepted(run,value)).toBe(1)
})
