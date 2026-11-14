import { readingInfo } from './readingInfo'
import { workspaceTask } from './workspaceWorker'
import { androidDevice,desktopDevice,nativeRequest } from './bridge'
export interface DeviceEntry<T=unknown> { version:number;value:T|null }
export const persistentDevice = androidDevice || desktopDevice
export async function readDeviceEntry<T>(key:string):Promise<DeviceEntry<T>> {
  if(androidDevice){
    const entry=await nativeRequest<DeviceEntry<T>&{chunked?:boolean;parts?:number}>('workspace.get',{key})
    if(!entry.chunked || !entry.parts)return entry
    const chunks:string[]=[]
    for(let part=0;part<entry.parts;part++)chunks.push((await nativeRequest<{data:string}>('workspace.chunk',{key,version:entry.version,part})).data)
    return {version:entry.version,value:await workspaceTask<T>({action:'decode',raw:chunks.join('')})}
  }
  return workspaceTask<DeviceEntry<T>>({action:'read',key})
}
export async function writeDeviceEntry(key:string,value:unknown,version?:number):Promise<{version:number}> {
  if(androidDevice){
    if(!key.startsWith('reading:')&&!key.startsWith('inventory:')&&!key.startsWith('reviews:'))return nativeRequest('workspace.put',{key,value,version})
    const raw=await workspaceTask<string>({action:'encode',value})
    const chunks:string[]=[]
    for(let offset=0;offset<raw.length;){let end=Math.min(offset+120000,raw.length);const last=raw.charCodeAt(end-1);if(end<raw.length && last>=0xd800 && last<=0xdbff)end--;chunks.push(raw.slice(offset,end));offset=end}
    const upload=await nativeRequest<{id:string}>('workspace.upload',{step:'begin',key,version,parts:chunks.length,info:key.startsWith('reading:')?readingInfo(value):undefined})
    try{
      for(let part=0;part<chunks.length;part++)await nativeRequest('workspace.upload',{step:'part',id:upload.id,part,data:chunks[part]})
      return await nativeRequest<{version:number}>('workspace.upload',{step:'commit',id:upload.id})
    }catch(cause){await nativeRequest('workspace.upload',{step:'abort',id:upload.id}).catch(()=>{});throw cause}
  }
  return workspaceTask<{version:number}>({action:'write',key,value,version})
}
export async function persistReading(key:string,value:unknown) {
  // Keep the comparison baseline: dropping it would force recalculation on every delivery.
  return writeDeviceEntry(`reading:${key}`,value)
}

export async function completedReadingInfo(account:string):Promise<import('./readingInfo').ReadingInfo & {pipeline:boolean;busy?:boolean;error?:string|null}> {
  if(androidDevice)return {...await nativeRequest<import('./readingInfo').ReadingInfo>('reading.status',{account}),pipeline:true}
  const response=await fetch(`/api/device/reading-status?account=${encodeURIComponent(account)}`,{cache:'no-store',signal:AbortSignal.timeout(15000)})
  if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))return {revision:-1,calculatedAt:null,pipeline:false}
  return response.json()
}
