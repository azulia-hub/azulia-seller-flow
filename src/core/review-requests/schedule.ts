import type { DailyReviewRun, ReviewSettings, ReviewWorkspace } from './types'

export const validReviewTime=(value:unknown):value is string=>typeof value==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
export const reviewTime=(settings:ReviewSettings|null|undefined)=>validReviewTime(settings?.dailyTime)?settings.dailyTime:'14:53'
/** Fixed IST offset makes scheduling independent of the device's selected timezone. */
export function reviewClock(now:string){
  const time=Date.parse(now)
  if(!Number.isFinite(time))throw new Error('Invalid review schedule timestamp.')
  const local=new Date(time+330*60000).toISOString()
  return {date:local.slice(0,10),time:local.slice(11,16)}
}
export function automaticReviewDue(settings:ReviewSettings|null|undefined,now:string){
  return settings?.autoEnabled===true&&reviewClock(now).time>=reviewTime(settings)
}
export function dailyReviewAccepted(run:DailyReviewRun,workspace:ReviewWorkspace){
  return run.orderIds.filter(id=>{const record=workspace.records[id];return record?.state==='sent'&&record.source==='automatic'&&Boolean(record.sentAt&&record.sentAt>=run.startedAt)}).length
}
