import {createReviewTransport} from '../../src/adapters/amazon-reviews/transport.ts'
import type {BackgroundCalculation } from './backgroundRunner.ts'
import type { ReportSync } from './sync/coordinator.ts'
import { createServer, type ServerResponse } from 'node:http'
import { readFile, realpath } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'
import { checkPilotCredentials, pilotCredentialsConfigured, type PilotCredentials } from '../amazon/pilot.ts'
import { createHash } from 'node:crypto'
import { validWorkspaceKey, type DeviceStore } from './deviceStore.ts'
import type { ImageStore } from './images.ts'
import { gzip, gunzip } from 'node:zlib'
import { promisify } from 'node:util'
const zip=promisify(gzip),unzip=promisify(gunzip)
const maximumReading=256*1024*1024,maximumCompressed=32*1024*1024

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Azulia local connection</title>
<style>body{font:1rem/1.6 system-ui;margin:24px;background:#faf8f2;color:#27251e}main{max-width:640px;margin:32px auto}button{font:inherit;min-height:44px;padding:12px 18px}#result{overflow-wrap:anywhere}</style></head><body><main>
<h1>Local Amazon connection</h1><p>Credentials stay on this computer. Configure them with <code>npm run local:setup</code>, then restart the launcher.</p>
<p>Check Amazon credential acceptance here. The local backend maintains financial activity in the background while it is running. Report uploads remain a fallback.</p>
<button id="check" type="button">Check Amazon credentials</button><p id="result" role="status" aria-live="polite"></p>
<a href="/">Open Azulia analytics and tools</a><p>Stop the connection with Ctrl+C in the launcher. Outside-network mobile access needs a separate private network setup.</p>
</main><script src="/auth/local.js" defer></script></body></html>`
const script = `const button=document.getElementById('check'),result=document.getElementById('result');button.addEventListener('click',async()=>{button.disabled=true;result.textContent='Checking…';try{const response=await fetch('/api/amazon/check',{method:'POST',headers:{'X-Azulia-Intent':'check-connection'}});const data=await response.json();result.textContent=response.ok&&data.tokenExchangeVerified?'Amazon accepted the credentials. Orders and financial permissions still need verification.':data.error==='amazon_not_configured'?'Run npm run local:setup, then restart the launcher.':response.status===429?'A check is already running. Please wait.':'Amazon could not verify the credentials. Check the local configuration and Amazon authorization.';}catch{result.textContent='Cannot reach the local backend. Check that the launcher is running.';}finally{button.disabled=false;}});`
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.txt': 'text/plain' }

export function createLocalServer(options: { port: number; dist: string; credentials: PilotCredentials; fetch?: typeof fetch; sync?: ReportSync; device?: DeviceStore; calculation?:BackgroundCalculation; images?: ImageStore }) {
  const reviewTransport=createReviewTransport(options.credentials,options.fetch??fetch)
  let inFlight = false
  const connectionKey = createHash('sha256').update(JSON.stringify(options.credentials)).digest('hex')
  function send(response: ServerResponse, status: number, body: string | Buffer, type = 'application/json; charset=utf-8',extra:Record<string,string>={}) {
    response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',...extra })
    response.end(body)
  }
  function json(response: ServerResponse, status: number, body: unknown) { send(response, status, JSON.stringify(body)) }
  const server = createServer({ requestTimeout: 20000, headersTimeout: 10000, maxHeaderSize: 16384 }, (request, response) => {
    void (async () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : options.port
      const origin = `http://127.0.0.1:${port}`
      // Listener is loopback-only; exact Host validation also prevents DNS rebinding.
      if (request.headers.host !== `127.0.0.1:${port}` || !['127.0.0.1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')) {
        json(response, 403, { error: 'forbidden' }); return
      }
      if (request.headers.origin && request.headers.origin !== origin) { json(response, 403, { error: 'forbidden' }); return }
      const path = decodeURIComponent(new URL(request.url ?? '/', origin).pathname)
      if(path==='/api/device/reading-status' && request.method==='GET'){
        const account=new URL(request.url!,origin).searchParams.get('account')??''
        if(!options.device||!/^[a-f0-9]{64}$/.test(account)){json(response,400,{error:'Invalid account.'});return}
        json(response,200,{...options.device.readingStatus(account),pipeline:true,...options.calculation?.status()});return
      }
      if(path==='/api/report-sync/refresh' && request.method==='POST'){
        if(request.headers.origin!==origin||request.headers['x-azulia-intent']!=='sync-report'){json(response,403,{error:'forbidden'});return}
        let range:import('../../src/core/sync/ranges.ts').SyncRange|undefined
        let forceHistory=true
        let body='';for await(const chunk of request){body+=chunk.toString();if(body.length>4096){json(response,413,{error:'Refresh request too large.'});return}}
        if(body){try{const input=JSON.parse(body);forceHistory=input.forceHistory!==false;if(input.from&&input.to){const from=Date.parse(`${input.from}T00:00:00+05:30`),to=Date.parse(`${input.to}T00:00:00+05:30`)+86400000;if(!Number.isFinite(from)||!Number.isFinite(to)||from>=to)throw new Error();range={from:new Date(from).toISOString(),to:new Date(to).toISOString()}}}catch{json(response,400,{error:'Invalid refresh dates.'});return}}
        options.sync?.refresh(range,forceHistory);options.calculation?.request();json(response,200,{queued:true});return
      }
      if(path==='/api/reviews/action'){
        if(request.method!=='POST'||request.headers.origin!==origin||request.headers['x-azulia-intent']!=='review-request'||!options.device){json(response,403,{error:'Review action is not allowed.'});return}
        let raw='';for await(const chunk of request){raw+=chunk.toString();if(raw.length>4096){json(response,413,{error:'Request too large.'});return}}
        try{
          const input=JSON.parse(raw);if(input.account!==connectionKey||typeof input.orderId!=='string'||!/^\w{3}-\d{7}-\d{7}$/.test(input.orderId))throw new Error('Invalid review identity.')
          const signal=AbortSignal.timeout(18000)
          if(input.action==='order'){json(response,200,await reviewTransport.order(input.orderId,signal));return}
          if(input.action==='eligibility'){json(response,200,{eligible:await reviewTransport.eligible(input.orderId,signal)});return}
          if(input.action!=='submit')throw new Error('Unsupported review action.')
          const key=`review-attempt:${connectionKey}:${input.orderId}`,entry=options.device.get(key),claim=entry.value as {attemptId?:string;state?:string;source?:string}|null
          if(!claim||claim.attemptId!==input.attemptId||claim.state!=='prepared')throw new Error('Submission is already dispatched or not claimed.')
          if(claim.source==='automatic'){
            const configEntry=options.device.get(`reviews-config:${connectionKey}`)
            if(!(configEntry.value as {autoEnabled?:boolean}|null)?.autoEnabled)throw new Error('Automatic sending was disabled before dispatch.')
          }
          const reviewWorkspace=(options.device.get(`reviews:${connectionKey}`).value as {blocked?:Record<string,boolean>}|null)
          if(reviewWorkspace?.blocked?.[input.orderId])throw new Error('Replacement chain was excluded before dispatch.')
          options.device.put(key,{...claim,state:'dispatched'},entry.version)
          await reviewTransport.submit(input.orderId,input.attemptId,signal);json(response,200,{accepted:true})
        }catch(cause){const error=cause as {message?:string;status?:number};json(response,error.status&&error.status>=400?error.status:409,{error:error.message??'Review action was not confirmed.'})}
        return
      }
      if (path === '/api/device/workspace') {
        if (!options.device) { json(response, 503, { error: 'Device storage is starting.' }); return }
        if (request.method === 'GET') {
          const key = new URL(request.url!, origin).searchParams.get('key') ?? ''
          if (!validWorkspaceKey(key)) { json(response, 400, { error: 'Unsupported storage key.' }); return }
          if(new URL(request.url!,origin).searchParams.get('head')==='1'){json(response,200,{version:options.device.version(key)});return}
          // Reuse stored JSON rather than parsing and stringifying a 200 MiB graph
          // on Node's request thread. zlib work runs asynchronously.
          const stored=options.device.encoded(key)
          const raw=stored.raw===null?Buffer.from('null'):stored.raw.startsWith('gz:')
            ?await unzip(Buffer.from(stored.raw.slice(3),'base64'),{maxOutputLength:maximumReading}):Buffer.from(stored.raw)
          const value=Buffer.concat([Buffer.from(`{"version":${stored.version},"value":`),raw,Buffer.from('}')])
          if(value.length>1024*1024 && /(?:^|[,\s])gzip(?:[,\s;]|$)/.test(request.headers['accept-encoding']??'')) send(response,200,await zip(value,{level:1}),'application/json; charset=utf-8',{'Content-Encoding':'gzip','Vary':'Accept-Encoding'})
          else send(response,200,value)
          return
        }
        if (request.method !== 'POST') { json(response, 405, { error: 'method_not_allowed' }); return }
        if (request.headers.origin !== origin || request.headers['x-azulia-intent'] !== 'device-workspace' || request.headers['content-type'] !== 'application/json') { json(response, 403, { error: 'forbidden' }); return }
        const compressed=request.headers['content-encoding']==='gzip'
        if(request.headers['content-encoding'] && !compressed && request.headers['content-encoding']!=='identity') { json(response,415,{error:'Unsupported reading compression.'}); return }
        const chunks: Buffer[] = []; let size = 0
        for await (const chunk of request) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > (compressed?maximumCompressed:maximumReading)) { json(response, 413, { error: 'Completed reading exceeds the supported storage size. Existing data is retained.' }); return }; chunks.push(bytes) }
        try {
          const wire=Buffer.concat(chunks)
          const decoded=compressed?await unzip(wire,{maxOutputLength:maximumReading}):wire
          const input = JSON.parse(decoded.toString('utf8'))
          if (!input || typeof input.key !== 'string' || !validWorkspaceKey(input.key) || input.value === undefined || (input.version !== undefined && (!Number.isSafeInteger(input.version) || input.version < 0))) throw new Error('Invalid input')
          json(response, 200, options.device.put(input.key, input.value, input.version));if(input.key==='settings')options.calculation?.request()
        } catch (error) { const cause=error as {status?:number;code?:string};json(response, cause.status === 409 ? 409 : cause.code==='ERR_BUFFER_TOO_LARGE'?413:400, { error: cause.code==='ERR_BUFFER_TOO_LARGE'?'Completed reading exceeds the supported storage size. Existing data is retained.':'Device save failed. Previously saved data is retained.' }) }
        return
      }
      if (path === '/api/device/image') {
        if (request.method !== 'GET') { json(response, 405, { error: 'method_not_allowed' }); return }
        if (!options.images) { json(response, 503, { error: 'Image storage is starting.' }); return }
        try {
          const image = await options.images.image(new URL(request.url!, origin).searchParams.get('url') ?? '')
          send(response, 200, image.bytes, image.type)
        } catch { json(response, 502, { error: 'Product image unavailable. Order data is unchanged.' }) }
        return
      }
      if (path === '/api/report-sync/range') {
        if (request.method !== 'POST') { json(response, 405, { error: 'method_not_allowed' }); return }
        if (request.headers.origin !== origin || request.headers['x-azulia-intent'] !== 'sync-report' || request.headers['content-type'] !== 'application/json') { json(response, 403, { error: 'forbidden' }); return }
        if (!options.sync) { json(response, 503, { error: 'Configure the local Amazon connection first.' }); return }
        let body = ''
        for await (const chunk of request) { body += chunk.toString(); if (Buffer.byteLength(body) > 4096) { json(response, 413, { error: 'Request too large.' }); return } }
        try {
          const input = JSON.parse(body) as Record<string, unknown>
          if (!input || Object.keys(input).some(key => !['connectionKey','from','to'].includes(key)) || input.connectionKey !== connectionKey) { json(response, 409, { error: 'The account changed. Reopen the local connection.' }); return }
          if (typeof input.from !== 'string' || typeof input.to !== 'string') throw new Error()
          options.sync.want({ from: input.from, to: input.to })
          json(response, 202, options.sync.status())
        } catch { json(response, 400, { error: 'Choose a valid history date range. Previously saved records are unchanged.' }) }
        return
      }
      if (path === '/api/amazon/check') {
        if (request.method !== 'POST') { json(response, 405, { error: 'method_not_allowed' }); return }
        if (request.headers.origin !== origin || request.headers['x-azulia-intent'] !== 'check-connection') { json(response, 403, { error: 'forbidden' }); return }
        if (!pilotCredentialsConfigured(options.credentials)) { json(response, 503, { error: 'amazon_not_configured' }); return }
        if (inFlight) { json(response, 429, { error: 'check_in_progress' }); return }
        inFlight = true
        try {
          const verified = await checkPilotCredentials(options.credentials, options.fetch ?? fetch)
          json(response, verified ? 200 : 502, { tokenExchangeVerified: verified, apiPermissionsVerified: false })
        } finally { inFlight = false }
        return
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') { json(response, 405, { error: 'method_not_allowed' }); return }
      if (path === '/api/report-sync/status') { json(response, 200, options.sync?.status() ?? { connectionKey, configured: false, state: 'idle', revision: 0, records: 0, coverage: [], error: null, lastSync: null, nextAttempt: null }); return }
      if (path === '/api/report-sync/data') {
        if (!options.sync) { json(response, 503, { error: 'Configure the local Amazon connection first.' }); return }
        const after = new URL(request.url ?? '/', origin).searchParams.get('after')
        if (after !== null && after === String(options.sync.status().revision)) { response.writeHead(204, { 'Cache-Control': 'no-store' }); response.end(); return }
        json(response, 200, options.sync.snapshot(after === null ? -1 : Number(after))); return
      }
      if (path === '/api/health') { json(response, 200, { service: 'azulia-local', status: 'ok' }); return }
      if (path === '/api/amazon/status') { json(response, 200, { credentialsConfigured: pilotCredentialsConfigured(options.credentials), connectionKey, connected: false, dataFetchingImplemented: Boolean(options.sync) }); return }
      if (path === '/auth/local') {
        response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'")
        send(response, 200, page, 'text/html; charset=utf-8'); return
      }
      if (path === '/auth/local.js') { send(response, 200, script, 'text/javascript'); return }
      if (['/api', '/auth'].some(prefix => path === prefix || path.startsWith(prefix + '/'))) { json(response, 404, { error: 'not_found' }); return }
      // Resolve symlinks too: never serve credentials or files outside dist.
      const root = await realpath(options.dist)
      const target = await realpath(resolve(root, path === '/' ? 'index.html' : `.${path}`))
      if (!target.startsWith(root + sep)) { json(response, 403, { error: 'forbidden' }); return }
      send(response, 200, request.method === 'HEAD' ? '' : await readFile(target), types[extname(target)] ?? 'application/octet-stream')
    })().catch(() => { if (!response.headersSent) json(response, 404, { error: 'not_found' }); else response.end() })
  })
  return server
}
