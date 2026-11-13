import { createBackgroundCalculation, type BackgroundCalculation } from './backgroundRunner.ts'
import { createHash } from 'node:crypto'
import { createReportSync } from './sync/coordinator.ts'
import { pilotCredentialsConfigured } from '../amazon/pilot.ts'
import { fileURLToPath } from 'node:url'
import { access } from 'node:fs/promises'
import { createLocalServer } from './server.ts'
import { loadCredentials } from './credentials.ts'
import { openDeviceStore, type DeviceStore } from './deviceStore.ts'
import { createImageStore } from './images.ts'

const port = 8788
let startupStage = 'frontend files'
let server: ReturnType<typeof createLocalServer> | undefined
let sync: Awaited<ReturnType<typeof createReportSync>> | undefined
let calculation:BackgroundCalculation|undefined
let device: DeviceStore | undefined
function closeDevice() { device?.close(); device = undefined }
try {
  const dist = fileURLToPath(new URL('../../dist/', import.meta.url))
  await access(new URL('../../dist/index.html', import.meta.url))
  startupStage = 'local credentials'
  const credentials = await loadCredentials(fileURLToPath(new URL('../../.local/amazon-credentials.json', import.meta.url)))
  // Acquire the listener first: a second launcher must not open or migrate the shared cache.
  startupStage = 'local HTTP server'
  const options: Parameters<typeof createLocalServer>[0] = { port, dist, credentials }
  const listener = createLocalServer(options)
  server = listener
  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject)
    listener.listen(port, '127.0.0.1', () => { listener.off('error', reject); resolve() })
  })
  startupStage = 'device storage'
  device = await openDeviceStore(fileURLToPath(new URL('../../.local/device-data/', import.meta.url)))
  options.device = device
  options.images = await createImageStore(fileURLToPath(new URL('../../.local/product-images/', import.meta.url)))
  startupStage = 'source cache and background sync'
  sync = pilotCredentialsConfigured(credentials) ? await createReportSync({ directory: fileURLToPath(new URL('../../.local/activity-cache/', import.meta.url)), connectionKey: createHash('sha256').update(JSON.stringify(credentials)).digest('hex'), credentials }) : undefined
  options.sync = sync
  if(sync){calculation=createBackgroundCalculation(sync,device,fileURLToPath(new URL('../../.local/device-data/',import.meta.url)),credentials);options.calculation=calculation}
  listener.on('error', (cause: NodeJS.ErrnoException) => {
    listener.closeAllConnections(); listener.close(); void calculation?.close(); void sync?.close(); closeDevice()
    const code = cause.code && /^[A-Z0-9_]+$/.test(cause.code) ? cause.code : 'LISTEN_ERROR'
    console.error(`Local server stopped (${code}). Saved data is retained.`)
    process.exitCode = 1
  })
  console.log(`Azulia: http://127.0.0.1:${port}/auth/local`)
  console.log(`App: http://127.0.0.1:${port}/`)
  console.log('Activity sync continues with the browser closed while this process is running.')
  console.log('Local access only. Keep this terminal open; Ctrl+C stops it.')
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { listener.closeAllConnections(); listener.close(); void calculation?.close(); void sync?.close(); closeDevice(); })
} catch (cause) {
  server?.closeAllConnections(); server?.close(); await calculation?.close();await sync?.close()
  closeDevice()
  const error = cause as NodeJS.ErrnoException & { errstr?: string }
  const code = error.code && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'STARTUP_ERROR'
  // Report stages/codes, never raw exceptions that might include connection secrets.
  console.error(`Could not start during ${startupStage} (${code}).`)
  if (code === 'EADDRINUSE') console.error('Port 8788 is already in use. Stop the existing Azulia server before restarting; the cache was not opened by this launcher.')
  else if (startupStage === 'frontend files') console.error('Run npm run build to create the frontend files.')
  else if (startupStage === 'local credentials') console.error('Check the private credentials file (mode 600); use npm run local:setup only if credentials need changing.')
  else if (code.startsWith('ERR_SQLITE')) {
    const detail = error.message
    if (/^(?:no such (?:column|table): [a-zA-Z0-9_.]+|database is locked|database is busy|attempt to write a readonly database|unable to open database file|disk I\/O error|database disk image is malformed|near "[a-zA-Z0-9_]+": syntax error)$/.test(detail)) console.error(`SQLite: ${detail}`)
    console.error('The local source cache could not be opened. Keep the cache; check permissions and stop another process using it.')
  }
  else console.error('Saved credentials and source data have been retained.')
  process.exitCode = 1
}
