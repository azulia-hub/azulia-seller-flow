import { createLocalServer } from '../../server/local/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDeviceStore } from '../../server/local/deviceStore'
import { createImageStore } from '../../server/local/images'
const cleanup: (() => Promise<unknown> | void)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'azulia-device-'))
  cleanup.push(() => rm(path, { recursive: true, force: true })); return path
}
describe('device-owned storage', () => {
  it('losslessly reopens a compressed reading with exact money and unknown fields', async () => {
    const path=await directory(), key=`reading:${'b'.repeat(64)}`
    const value={sourceRecords:[{currencyAmount:'123456789.91',futureLabel:'unknown-source-label'.repeat(70000)}]}
    const first=await openDeviceStore(path)
    try { first.put(key,value) } finally { first.close() }
    const reopened=await openDeviceStore(path); cleanup.push(()=>reopened.close())
    expect(reopened.get(key).value).toEqual(value)
    const server=createLocalServer({port:0,dist:path,credentials:{},device:reopened})
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
    cleanup.push(()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())))
    const address=server.address()
    if(!address || typeof address==='string')throw new Error('No local test port')
    const response=await fetch(`http://127.0.0.1:${address.port}/api/device/workspace?key=${key}`)
    expect(response.headers.get('content-encoding')).toBe('gzip')
    expect(await response.json()).toEqual({version:1,value})
  })
  it('retains unknown fields and exact financial strings across restarts', async () => {
    const path = await directory(), key = `reading:${'a'.repeat(64)}`
    const value = { revision: 4, sourceRecords: [{ amount: '123456789.91', futureField: { label: 'unknown tax', amount: '-3.17' } }] }
    const first = await openDeviceStore(path)
    try { first.put(key, value) } finally { first.close() }
    const reopened = await openDeviceStore(path); cleanup.push(() => reopened.close())
    expect(reopened.get(key).value).toEqual(value)
  })
  it('rejects stale saves, ignores reordered identical content and restricts keys', async () => {
    const store = await openDeviceStore(await directory()); cleanup.push(() => store.close())
    expect(store.put('settings', { costs: [{ sku: 'one', unitCost: 30 }] }, 0)).toEqual({ version: 1 })
    expect(() => store.put('settings', { costs: [] }, 0)).toThrow('conflict')
    expect(store.get('settings').value).toEqual({ costs: [{ sku: 'one', unitCost: 30 }] })
    expect(store.put('settings', { costs: [{ unitCost: 30, sku: 'one' }] }, 1)).toEqual({ version: 1 })
    expect(() => store.put('../credentials', {})).toThrow('Unsupported')
  })
})
describe('retained product images', () => {
  const url = 'https://m.media-amazon.com/images/I/example.jpg', jpeg = new Uint8Array([255, 216, 255, 224, 0, 0])
  it('reuses downloaded bytes after restart without network access', async () => {
    const path = await directory(), request = vi.fn<typeof fetch>(async () => new Response(jpeg))
    expect((await (await createImageStore(path, request)).image(url)).type).toBe('image/jpeg')
    expect(request).toHaveBeenCalledTimes(1)
    const offline = vi.fn<typeof fetch>(async () => { throw new Error('Offline') })
    const restarted = await createImageStore(path, offline)
    expect(new Uint8Array((await restarted.image(url)).bytes)).toEqual(jpeg)
    expect(offline).not.toHaveBeenCalled()
  })
  it('blocks arbitrary hosts and redirects without contacting their targets', async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/secret' } }))
    const store = await createImageStore(await directory(), request)
    await expect(store.image('https://evil.example/image')).rejects.toThrow('host')
    expect(request).not.toHaveBeenCalled()
    await expect(store.image(url)).rejects.toThrow('redirect')
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('rejects executable contents even when the server claims image/jpeg', async () => {
    const store = await createImageStore(await directory(), async () => new Response('<svg onload="alert(1)"/>', { headers: { 'Content-Type': 'image/jpeg' } }))
    await expect(store.image(url)).rejects.toThrow('contents')
  })
})
