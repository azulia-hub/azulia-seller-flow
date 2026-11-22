import { preferences, type AppPreferences } from '../../core/settings/preferences'
import { formatInr } from '../formatting/currency'
let current: AppPreferences
try { current=preferences(JSON.parse(localStorage.getItem('azulia.preferences')||'null'));const theme=localStorage.getItem('azulia-theme');if(!localStorage.getItem('azulia.preferences') && (theme==='dark'||theme==='light'))current.theme=theme } catch { current=preferences(null) }
const listeners=new Set<()=>void>()
export function currentPreferences() { return current }
export function applyPreferences(value:unknown) {
  const next=preferences(value)
  if(JSON.stringify(current)===JSON.stringify(next))return
  current=next
  try{localStorage.setItem('azulia.preferences',JSON.stringify(next))}catch{/* Durable device settings remain authoritative. */}
  for(const notify of listeners)notify()
}
export function subscribePreferences(notify:()=>void) {listeners.add(notify);return()=>{listeners.delete(notify)}}
export function formatMoney(value:number,config=current):string {
  return formatInr(value, config.numberGrouping === 'indian' ? 'en-IN' : 'en-US', config.moneyDecimals)
}
