export const DEVICE_BRIDGE_VERSION = 7
interface DeviceMessagePort { postMessage(message:string):void; onmessage:((event:{data:string})=>void)|null }
declare global { interface Window { AzuliaDevice?:DeviceMessagePort } }
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
