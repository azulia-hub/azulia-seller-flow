import { describe, expect, it } from 'vitest'
import { SharedStore, emptyMetadata } from './store'
import type { SharedDatabase } from './database'

describe('Netlify database adapter contract (execution deferred)',() => {
  it('binds tenant IDs, revisions and raw JSON as SQL parameters',async () => {
    const calls:{statement:string;parameters:unknown[]}[]=[]
    const database:SharedDatabase={async query<Row extends object>(statement:string,parameters:unknown[]=[]) {
      calls.push({statement,parameters})
      return [{committed:true}] as unknown as Row[]
    }}
    const store=new SharedStore({},database), owner='12345678-1234-4234-8234-123456789012'
    const unknown={label:"Unknown ' / event",amount:'123.45',extra:{preserve:true}}
    await store.commit(owner,9,emptyMetadata('account'),[{kind:'records',id:"source'identity",value:unknown}])
    expect(calls[0].statement).toContain('$1::uuid')
    expect(calls[0].statement).not.toContain(owner)
    expect(calls[0].parameters.slice(0,2)).toEqual([owner,9])
    expect(JSON.parse(calls[0].parameters[3] as string)[0].value).toEqual(unknown)
  })
  it('surfaces a compare-and-swap conflict without acknowledging a source page',async () => {
    const database:SharedDatabase={async query<Row extends object>() {return [{committed:false}] as unknown as Row[]}}
    const store=new SharedStore({},database)
    await expect(store.commit('owner',1,emptyMetadata('account'))).rejects.toMatchObject({status:409})
  })
  it('does not expose database URLs or driver errors to the client',async () => {
    const database:SharedDatabase={query:async () => {throw new Error('postgres://private:password@example.test/database')}}
    const store=new SharedStore({},database)
    await expect(store.metadata('owner')).rejects.toThrow('Netlify Database is unavailable')
    await expect(store.metadata('owner')).rejects.not.toThrow('private:password')
  })
})
