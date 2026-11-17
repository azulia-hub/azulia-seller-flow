export const DEVICE_BRIDGE_VERSION = 10
import { receiveBridgeNavigation } from './notificationNavigation'
interface DeviceMessagePort { postMessage(message:string):void; onmessage:((event:{data:string})=>void)|null }
declare global { interface Window { AzuliaDevice?:DeviceMessagePort; __azuliaOnNav?: (raw: unknown) => void } }
export const androidDevice = typeof window!=='undefined' && Boolean(window.AzuliaDevice?.postMessage)
export const desktopDevice = typeof location!=='undefined' && location.hostname==='127.0.0.1' && location.port==='8788'
let bound=false
const pending=new Map<string,{resolve:(value:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>()
export function nativeRequest<T>(action:string,payload:Record<string,unknown>={}):Promise<T> {
  const port=window.AzuliaDevice
  if(!port) return Promise.reject(new Error('This operation needs the Android app.'))
  if(!bound) {bound=true;port.onmessage=event=>{
    try {const value=JSON.parse(event.data), item=pending.get(value.id);if(!item)return;pending.delete(value.id);clearTimeout(item.timer)
      if(value.error)item.reject(Object.assign(new Error(value.error),{status:value.status,retryAfter:value.retryAfter}));else item.resolve(value.result)
    }catch {/* An unrelated message cannot complete a native request. */}
  }}
  return new Promise<T>((resolve,reject)=>{
    const id=crypto.randomUUID(),timer=setTimeout(()=>{pending.delete(id);reject(new Error('The phone operation timed out. Saved data is retained.'))},60000)
    pending.set(id,{resolve:value=>resolve(value as T),reject,timer})
    try {port.postMessage(JSON.stringify({id,version:DEVICE_BRIDGE_VERSION,action,payload}))}catch{clearTimeout(timer);pending.delete(id);reject(new Error('Could not contact the Android bridge.'))}
  })
}

/** Polls the bridge for a pending notification navigation destination.
 * Safe to call at startup or reconnect; does not clear pending state until acknowledged. */
export async function pollNotificationDestination(): Promise<void> {
  if (!androidDevice) return
  try {
    const result = await nativeRequest<unknown>('notification.navigate', {})
    if (result && typeof result === 'object' && Object.keys(result).length > 0) {
      receiveBridgeNavigation(result)
    }
  } catch { /* Navigation degrades gracefully. */ }
}

/** Acknowledges handled navigation to native, clearing the pending intent. */
export async function acknowledgeNotificationDestination(eventId: string): Promise<boolean> {
  if (!androidDevice || !eventId) return false
  try {
    const res = await nativeRequest<{ acknowledged?: boolean }>('notification.ack', { eventId })
    return Boolean(res?.acknowledged)
  } catch {
    return false
  }
}

if (typeof window !== 'undefined') {
  window.__azuliaOnNav = (raw: unknown) => {
    receiveBridgeNavigation(raw)
  }
}
