import { useEffect, useState } from 'react'
import { sharedDelivery, sharedRequest, sharedSignedIn } from '../adapters/amazon-shared/client'
import type { SharedDashboard } from '../adapters/amazon-shared/dashboard'
export function useSharedDashboard(options:{enabled:boolean;revision:number|null;from:string;to:string;fulfillment:string;settings:unknown}) {
  const key = JSON.stringify(options), [saved,setSaved] = useState<{key:string;result:SharedDashboard}|null>(null),[error,setError] = useState('')
  useEffect(() => {
    if (!sharedDelivery || !sharedSignedIn() || !options.enabled || options.revision===null || !options.from || !options.to) return
    const abort = new AbortController(); let working = false
    async function read() {
      if (working) return
      working=true
      try {
        const result = await sharedRequest<SharedDashboard>('dashboard',{revision:options.revision,range:{from:options.from,to:options.to,fulfillment:options.fulfillment}},abort.signal)
        if (!abort.signal.aborted) {setSaved({key,result});setError('')}
      } catch (cause) {if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Shared calculation unavailable.')}
      finally {working=false}
    }
    void read(); const timer=setInterval(() => {void read()},15000)
    return () => {abort.abort();clearInterval(timer)}
    // The key includes source revision, filter specification and shared settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key])
  return {result:saved?.key===key ? saved.result : null,error}
}
