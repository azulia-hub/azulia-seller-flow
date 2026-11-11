import { createHash } from 'node:crypto'
import { SharedStore, SharedError, accountKey } from './store'
import { preparePage, requireLease, type SourcePage } from './page'
import type { BrowserJob, CacheMeta } from '../../src/adapters/amazon-shared/contracts'
import { sourceSnapshot } from '../../src/adapters/amazon-shared/snapshot'
import { toUnifiedReport } from '../../src/adapters/amazon-report-sync/toUnifiedReport'
import { object, text } from '../../src/adapters/amazon-report-sync/money'
import { requirePilotAccessToken, TokenExchangeError } from '../amazon/pilot'
import { handleAmazonRelay } from '../relay/handler'
import { calculateSharedDashboard } from './dashboard'
import type { CalculationSettings } from '../../src/adapters/amazon-shared/contracts'
import { getIndiaToday } from '../../src/core/sync/planner'
import { OwnerAuth } from './auth'
import { SqlOwnerAuthRepository } from './authStore'
import type { SharedDatabase } from './database'

// Bump whenever server normalization changes. A browser cache cannot select the engine.
export const SHARED_ENGINE = 'shared-1-delivery-15'
const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Netlify-CDN-Cache-Control':'no-store','CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}
const json = (value: unknown, status = 200) => {
  const body = JSON.stringify(value)
  if (Buffer.byteLength(body) > 18 * 1024 * 1024) return new Response(JSON.stringify({error:'Shared reading exceeds the delivery limit. Narrowing server snapshots is required; the previous reading is retained.'}),{status:413,headers})
  return new Response(new ReadableStream({start(controller) {controller.enqueue(new TextEncoder().encode(body));controller.close()}}),{status,headers})
}
async function input(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) throw new SharedError('Missing request.',400)
  const chunks: Uint8Array[] = []; let size = 0
  try {
    while (true) { const {done,value} = await reader.read(); if (done) break; size += value.byteLength; if (size > 4 * 1024 * 1024) throw new SharedError('Request is too large.',413); chunks.push(value) }
  } finally { await reader.cancel() }
  return object(JSON.parse(Buffer.concat(chunks).toString('utf8')))
}
function field(value: unknown, max: number) {
  if (typeof value !== 'string' || !value || value.length > max || /[\r\n\0]/.test(value)) throw new SharedError('Invalid connection field.',400)
  return value
}
const tokenCache = new Map<string,{value:string;until:number}>()
export async function handleSharedAccount(request:Request,environment:Record<string,string|undefined> = process.env,upstream:typeof fetch=fetch,clientAddress='unknown',database?:SharedDatabase):Promise<Response> {
  const origin = request.headers.get('origin'), ownOrigin = new URL(request.url).origin
  const allowed = [ownOrigin,...(environment.AZULIA_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean)]
  if (!origin || !allowed.includes(origin)) return json({error:'Request origin is not allowed.'},403)
  const response = request.method === 'OPTIONS' ? new Response(null,{status:204}) : await handleSharedOperation(request,environment,upstream,clientAddress,database)
  const responseHeaders = new Headers(response.headers)
  responseHeaders.set('Access-Control-Allow-Origin',origin);responseHeaders.set('Vary','Origin')
  responseHeaders.set('Access-Control-Allow-Methods','POST, OPTIONS');responseHeaders.set('Access-Control-Allow-Headers','Authorization, Content-Type, X-Azulia-Intent')
  responseHeaders.set('Cache-Control','private, no-store')
  return new Response(response.body,{status:response.status,headers:responseHeaders})
}
async function handleSharedOperation(request: Request, environment: Record<string,string | undefined>, upstream: typeof fetch, clientAddress:string, database?:SharedDatabase): Promise<Response> {
  if (request.method !== 'POST') return json({error:'Use POST.'},405)
  if (request.headers.get('x-azulia-intent') !== 'shared-account' || request.headers.get('content-type') !== 'application/json') return json({error:'Request intent is not allowed.'},403)
  try {
    const store = new SharedStore(environment,database), body = await input(request), action = text(body.action)
    const auth = new OwnerAuth(environment,new SqlOwnerAuthRepository(store.database))
    if (action==='login') return json(await auth.login(field(body.email,320),field(body.password,1024),clientAddress))
    if (action==='refresh') return json(await auth.refresh(field(body.refreshToken,8192)))
    const authorization=request.headers.get('authorization') ?? ''
    const user=await auth.authenticate(authorization), owner=user.id
    if (action==='logout') {await auth.logout(authorization);return json({signedOut:true})}
    await store.ensure(owner)
    const row = await store.metadata(owner), account = accountKey(owner)
    if (body.account !== undefined && body.account !== account) throw new SharedError('The seller account changed. Sign in again.',409)
    if (action === 'status') return json({account,version:row.version,meta:row.metadata,configured:Boolean(row.credentials),settings:row.settings,settingsVersion:row.settings_version,engine:SHARED_ENGINE})
    if (action === 'load') {
      const cache = await store.snapshot(owner)
      // The browser planner needs identities, not a second copy of the financial ledger.
      // Full raw source remains in Postgres and is normalized on the server.
      return json({...cache,records:cache.records.map(record => ({transactionId:record.transactionId,postedDate:record.postedDate,relatedIdentifiers:record.relatedIdentifiers,items:Array.isArray(record.items) ? record.items.map(value => ({contexts:object(value).contexts})) : []}))})
    }
    if (action === 'meta') {
      if (body.version !== row.version) throw new SharedError('A different device advanced this sync checkpoint.',409)
      const metadata = object(body.meta) as unknown as CacheMeta
      // Metadata-only requests cannot invent source revisions or change identities.
      if (metadata.account !== account || metadata.revision !== row.metadata.revision || !Array.isArray(metadata.jobs)) throw new SharedError('Invalid sync metadata.',400)
      if (metadata.leaseOwner && row.metadata.leaseOwner && metadata.leaseOwner !== row.metadata.leaseOwner && (row.metadata.leaseUntil ?? 0) > Date.now()) throw new SharedError('Another device owns the shared sync lock.',409)
      if (metadata.leaseOwner) metadata.leaseUntil=Date.now()+120000
      await store.commit(owner,row.version,metadata); return json({meta:metadata,version:row.version+1})
    }
    if (action === 'page') {
      const cache = await store.snapshot(owner)
      const result = preparePage(cache,field(body.owner,128),body.job as BrowserJob,body.page as SourcePage,Date.now())
      await store.commit(owner,cache.version,result.metadata,result.writes)
      return json({revision:result.metadata.revision})
    }
    if (action === 'settings') {
      if (body.version !== row.settings_version) throw new SharedError('Settings changed on another device. Refresh before saving.',409)
      const settings = object(body.settings)
      if (!Array.isArray(settings.costs) || !Array.isArray(settings.classificationRules) || !['BLOCK','ASSUME_ZERO'].includes(text(settings.missingCostPolicy))) throw new SharedError('Invalid calculation settings.',400)
      const result = await store.saveSettings(owner,row.settings_version,settings)
      if (result !== true) throw new SharedError('Settings changed on another device. Refresh before saving.',409)
      return json({settingsVersion:row.settings_version+1})
    }
    if (action === 'reading' || action === 'dashboard') {
      const cache = await store.snapshot(owner), snapshot = sourceSnapshot(account,cache)
      if (action === 'dashboard' && body.revision !== snapshot.revision) throw new SharedError('Source data advanced. Waiting for its matching reading.',409)
      let normalized = await store.readNormalization(owner,snapshot.revision,SHARED_ENGINE)
      if (!normalized) {
        normalized = {...toUnifiedReport(snapshot),calculatedAt:new Date().toISOString()}
        await store.saveNormalization(owner,snapshot.revision,SHARED_ENGINE,normalized)
      }
      if (action === 'dashboard') {
        const range = object(body.range), from = text(range.from), to = text(range.to)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new SharedError('Invalid dashboard date range.',400)
        const key = createHash('sha256').update(JSON.stringify({revision:snapshot.revision,settings:cache.settingsVersion,engine:SHARED_ENGINE,from,to,fulfillment:text(range.fulfillment),today:getIndiaToday()})).digest('hex')
        const stored = await store.readCalculation(owner,key)
        if (stored) return json(stored)
        const result = {revision:snapshot.revision,settingsVersion:cache.settingsVersion,engine:SHARED_ENGINE,calculatedAt:new Date().toISOString(),...calculateSharedDashboard((normalized as ReturnType<typeof toUnifiedReport>).dataset,cache.settings as CalculationSettings,{from,to,fulfillment:text(range.fulfillment)},cache.meta.purchaseCoverage,getIndiaToday())}
        await store.saveCalculation(owner,key,result)
        return json(result)
      }
      return json({snapshot:{...snapshot,records:[]},normalized,engine:SHARED_ENGINE,settings:cache.settings,settingsVersion:cache.settingsVersion})
    }
    if (action === 'disconnect') { await store.disconnect(owner); return json({disconnected:true}) }
    if (action === 'amazon') {
      const operation = object(body.operation)
      if (operation.syncJob) {
        requireLease(row.metadata,field(operation.syncOwner,128),Date.now())
        const job=operation.syncJob as BrowserJob, saved=row.metadata.jobs.find(value => value.id===job.id)
        if (!saved || saved.nextToken !== job.nextToken || (job.kind==='history' ? 'finance' : job.kind) !== operation.action) throw new SharedError('The shared job already advanced. Read its saved checkpoint.',409)
      }
      let credentials: Record<string,string>
      if (operation.action === 'connect') credentials = {AMAZON_SP_CLIENT_ID:field(operation.clientId,1024),AMAZON_SP_CLIENT_SECRET:field(operation.clientSecret,2048),AMAZON_SP_REFRESH_TOKEN:field(operation.refreshToken,8192)}
      else {
        if (!row.credentials) throw new SharedError('Connect Amazon to this seller account first.',409)
        credentials = store.decrypt(owner,row.credentials)
      }
      const fingerprint = createHash('sha256').update(JSON.stringify(credentials)).digest('hex'), tokenKey = `${owner}:${fingerprint}`
      let token = tokenCache.get(tokenKey)
      if (!token || token.until < Date.now()) {
        token = {value:await requirePilotAccessToken(credentials,upstream),until:Date.now()+40*60000}
        if (tokenCache.size > 100) tokenCache.clear()
        tokenCache.set(tokenKey,token)
      }
      if (operation.action === 'connect') {
        // Never let a reconnect splice a different seller's records into this account.
        if (row.credentials) {
          const existing = store.decrypt(owner,row.credentials)
          if (existing.AMAZON_SP_REFRESH_TOKEN !== credentials.AMAZON_SP_REFRESH_TOKEN || existing.AMAZON_SP_CLIENT_ID !== credentials.AMAZON_SP_CLIENT_ID) throw new SharedError('This account already belongs to another Amazon authorization. Use a separate seller login to avoid mixing data.',409)
        }
        const identity=createHash('sha256').update(JSON.stringify([credentials.AMAZON_SP_CLIENT_ID,credentials.AMAZON_SP_REFRESH_TOKEN])).digest('hex')
        const connected=await store.connect(owner,identity,store.encrypt(owner,credentials))
        if (connected !== true) throw new SharedError('This workspace is bound to another Amazon authorization. Use a separate workspace to avoid mixing sellers.',409)
        return json({accessToken:'server-managed',account,expiresIn:2700})
      }
      const relay = new Request(new URL('/.netlify/functions/amazon',request.url),{method:'POST',headers:{Origin:new URL(request.url).origin,'Content-Type':'application/json','X-Azulia-Intent':'amazon-relay'},body:JSON.stringify({action:operation.action,from:operation.from,to:operation.to,orderId:operation.orderId,asin:operation.asin,nextToken:operation.nextToken,accessToken:token.value}),signal:request.signal})
      const response = await handleAmazonRelay(relay,upstream)
      if (response.status === 401) tokenCache.delete(tokenKey)
      if (response.ok && operation.syncJob) {
        const page = object(await response.json()), job = operation.syncJob as BrowserJob
        const mappedOrder = (value:unknown) => {const input=object(value),summary=object(input.summary);return {...summary,id:text(input.id),purchased:text(input.purchased),status:text(summary.status)||null,fulfillmentType:text(summary.fulfillmentType)||null,orderValue:text(summary.orderValue)||null,currency:text(summary.currency)||null}}
        const source:SourcePage = {
          nextToken:text(page.nextToken)||null,
          records:Array.isArray(page.records) ? page.records.map(object) : undefined,
          orders:job.kind==='order' ? [mappedOrder(page)] : job.kind==='purchases' && Array.isArray(page.orders) ? page.orders.map(mappedOrder) : undefined,
          catalog:job.kind==='catalog' ? page as unknown as SourcePage['catalog'] : undefined,
          orderItems:job.kind==='orderItems' && Array.isArray(page.items) ? page.items as SourcePage['orderItems'] : undefined,
          issues:Array.isArray(page.issues) ? page.issues.map(value => JSON.stringify(value)) : undefined,
        }
        if ((job.kind==='finance' || job.kind==='history') && !source.records || job.kind==='purchases' && !source.orders || job.kind==='orderItems' && !source.orderItems) throw new SharedError('Unsupported source page. The checkpoint was retained.',502)
        const cache = await store.snapshot(owner), prepared = preparePage(cache,field(operation.syncOwner,128),job,source,Date.now())
        await store.commit(owner,cache.version,prepared.metadata,prepared.writes)
        return json({...page,sharedCommitted:true})
      }
      return response
    }
    throw new SharedError('Unsupported shared account operation.',400)
  } catch (cause) {
    if (cause instanceof SharedError) return json({error:cause.message},cause.status)
    if (cause instanceof TokenExchangeError) return json({error:'Amazon authorization could not be renewed. Check the saved connection.',retryAfter:cause.retryAfter},cause.status >=400 && cause.status<=599 ? cause.status : 502)
    return json({error:'The shared request failed. The last completed data remains available; check server configuration or Amazon authorization.'},502)
  }
}
