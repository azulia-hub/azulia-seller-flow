import { DatabaseSync } from 'node:sqlite'
import { mkdir,chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { sameContent } from '../../src/core/sync/sameContent.ts'
import { gzipSync,gunzipSync } from 'node:zlib'
export const validWorkspaceKey=(key:string)=>/^(?:settings|(?:reading|inventory|inventory-config|inventory-alerts):[a-f0-9]{64})$/.test(key)
export async function openDeviceStore(directory:string) {
  await mkdir(directory,{recursive:true,mode:0o700})
  const path=join(directory,'workspace.sqlite'),db=new DatabaseSync(path)
  await chmod(path,0o600)
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS workspace_values(name TEXT PRIMARY KEY,version INTEGER NOT NULL,raw TEXT NOT NULL,updated TEXT NOT NULL);')
  const encoded=(key:string)=>{
    if(!validWorkspaceKey(key))throw new Error('Unsupported workspace key.')
    const row=db.prepare('SELECT version,raw FROM workspace_values WHERE name=?').get(key) as {version:number;raw:string}|undefined
    return row ?? {version:0,raw:null}
  }
  const get=(key:string)=>{
    const row=encoded(key)
    return row.raw===null?{version:0,value:null}:{version:row.version,value:JSON.parse(row.raw.startsWith('gz:')?gunzipSync(Buffer.from(row.raw.slice(3),'base64'),{maxOutputLength:256*1024*1024}).toString('utf8'):row.raw)}
  }
  const readingStatus=(account:string)=>{
    if(!/^[a-f0-9]{64}$/.test(account))throw new Error('Invalid account.')
    const row=db.prepare('SELECT raw FROM workspace_values WHERE name=?').get(`head:reading:${account}`) as {raw:string}|undefined
    return row?JSON.parse(row.raw) as {revision:number;calculatedAt:string;calculationKey?:string}:{revision:-1,calculatedAt:null,calculationKey:undefined}
  }
  return {get,encoded,readingStatus,version(key:string){if(!validWorkspaceKey(key))throw new Error('Invalid key.');return (db.prepare('SELECT version FROM workspace_values WHERE name=?').get(key) as {version:number}|undefined)?.version??0},put(key:string,value:unknown,version?:number) {
    if(!validWorkspaceKey(key) || value===undefined)throw new Error('Unsupported workspace value.')
    db.exec('BEGIN IMMEDIATE')
    try {
      const old=get(key)
      if(version!==undefined && version!==old.version)throw Object.assign(new Error('Workspace version conflict.'),{status:409})
      if(sameContent(old.value,value)){db.exec('COMMIT');return{version:old.version}}
      const next=old.version+1
      const serialized=JSON.stringify(value)
      const raw=(key.startsWith('reading:') || key.startsWith('inventory:')) && serialized.length>1024*1024?'gz:'+gzipSync(serialized,{level:1}).toString('base64'):serialized
      db.prepare('INSERT INTO workspace_values VALUES(?,?,?,?) ON CONFLICT(name) DO UPDATE SET version=excluded.version,raw=excluded.raw,updated=excluded.updated').run(key,next,raw,new Date().toISOString())
      if(key.startsWith('reading:')){
        const reading=value as {revision?:number;importedAt?:string;precomputed?:{key?:string}}
        if(Number.isSafeInteger(reading.revision))db.prepare('INSERT INTO workspace_values VALUES(?,?,?,?) ON CONFLICT(name) DO UPDATE SET version=excluded.version,raw=excluded.raw,updated=excluded.updated').run('head:'+key,next,JSON.stringify({revision:reading.revision,calculatedAt:reading.importedAt??null,calculationKey:reading.precomputed?.key}),new Date().toISOString())
      }
      db.exec('COMMIT');return{version:next}
    }catch(error){db.exec('ROLLBACK');throw error}
  },close(){db.close()}}
}
export type DeviceStore=Awaited<ReturnType<typeof openDeviceStore>>
