import { createHash,randomBytes } from 'node:crypto'
import { mkdir,readFile,writeFile,rename } from 'node:fs/promises'
import { join } from 'node:path'
import { retainedImageUrl } from '../../src/adapters/device/imagePolicy.ts'
const maximum=5*1024*1024
export async function createImageStore(directory:string,request:typeof fetch=fetch) {
  await mkdir(directory,{recursive:true,mode:0o700})
  let active=0
  const waiting:(()=>void)[]=[]
  const pending=new Map<string,Promise<{bytes:Buffer;type:string}>>()
  async function image(input:string) {
    const url=retainedImageUrl(input);if(!url)throw new Error('Unsupported image host.')
    const key=createHash('sha256').update(url).digest('hex'),path=join(directory,key)
    try {const [bytes,meta]=await Promise.all([readFile(path),readFile(path+'.json','utf8')]);return {bytes,type:JSON.parse(meta).type as string}}
    catch(cause){if((cause as NodeJS.ErrnoException).code!=='ENOENT')throw cause}
    if(pending.has(key))return pending.get(key)!
    if(pending.size>=128)throw new Error('Image download queue is busy; retry shortly.')
    const job=(async()=>{
      if(active>=4)await new Promise<void>(resolve=>waiting.push(resolve))
      active++
      let current=url,response:Response|undefined
      for(let attempt=0;attempt<4;attempt++) {
        response=await request(current,{redirect:'manual',signal:AbortSignal.timeout(15000)})
        if(![301,302,303,307,308].includes(response.status))break
        const location=response.headers.get('location');await response.body?.cancel()
        const next=location?retainedImageUrl(new URL(location,current).href):null;if(!next)throw new Error('Unsupported image redirect.');current=next
      }
      if(!response?.ok || !response.body){await response?.body?.cancel();throw new Error('Image download unavailable.')}
      const reader=response.body.getReader(),chunks:Buffer[]=[];let size=0
      try {while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>maximum)throw new Error('Image exceeds size limit.');chunks.push(Buffer.from(part.value))}}finally{await reader.cancel()}
      const bytes=Buffer.concat(chunks)
      const type=bytes.subarray(0,3).equals(Buffer.from([255,216,255]))?'image/jpeg':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP'?'image/webp':/^GIF8[79]a/.test(bytes.toString('ascii',0,6))?'image/gif':null
      if(!type)throw new Error('Unsupported image contents.')
      const temporary=path+'.'+randomBytes(6).toString('hex')+'.tmp'
      await writeFile(temporary,bytes,{mode:0o600,flag:'wx'});await rename(temporary,path)
      await writeFile(path+'.json',JSON.stringify({url,type,size:bytes.length,savedAt:new Date().toISOString()}),{mode:0o600})
      return {bytes,type}
    })().finally(()=>{pending.delete(key);active--;waiting.shift()?.()})
    pending.set(key,job);return job
  }
  return {image}
}
export type ImageStore=Awaited<ReturnType<typeof createImageStore>>
