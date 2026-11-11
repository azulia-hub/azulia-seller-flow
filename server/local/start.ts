import { createHash } from 'node:crypto'
import { createReportSync } from './sync/coordinator.ts'
import { pilotCredentialsConfigured } from '../amazon/pilot.ts'
import { fileURLToPath } from 'node:url'
import { access } from 'node:fs/promises'
import { createLocalServer } from './server.ts'
import { loadCredentials } from './credentials.ts'

const port = 8788
let startupStage = 'frontend files'
let server: ReturnType<typeof createLocalServer> | undefined
let sync: Awaited<ReturnType<typeof createReportSync>> | undefined
try {
  const dist = fileURLToPath(new URL('../../dist/', import.meta.url))
  await access(new URL('../../dist/index.html', import.meta.url))
  startupStage = 'local credentials'
  const sharedMode = process.env.AZULIA_SHARED_MODE === '1'
  const credentials = sharedMode ? {} : await loadCredentials(fileURLToPath(new URL('../../.local/amazon-credentials.json', import.meta.url)))
  // Acquire the listener first: a second launcher must not open or migrate the shared cache.
  startupStage = 'local HTTP server'
  const options: Parameters<typeof createLocalServer>[0] = { port, dist, credentials }
  const listener = createLocalServer(options)
  server = listener
  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject)
    listener.listen(port, '127.0.0.1', () => { listener.off('error', reject); resolve() })
  })
  startupStage = 'source cache and background sync'
  sync = pilotCredentialsConfigured(credentials) ? await createReportSync({ directory: fileURLToPath(new URL('../../.local/activity-cache/', import.meta.url)), connectionKey: createHash('sha256').update(JSON.stringify(credentials)).digest('hex'), credentials }) : undefined
  options.sync = sync
  listener.on('error', (cause: NodeJS.ErrnoException) => {
    listener.closeAllConnections(); listener.close(); void sync?.close()
    const code = cause.code && /^[A-Z0-9_]+$/.test(cause.code) ? cause.code : 'LISTEN_ERROR'
    console.error(`Local server stopped (${code}). Saved data is retained.`)
    process.exitCode = 1
  })
  console.log(`Azulia: http://127.0.0.1:${port}/auth/local`)
  console.log(`App: http://127.0.0.1:${port}/`)
  console.log(sharedMode ? 'Shared mode: this server serves the UI only. Amazon data comes from the configured shared backend.' : 'Activity sync continues with the browser closed while this process is running.')
  console.log('Local access only. Keep this terminal open; Ctrl+C stops it.')
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { listener.closeAllConnections(); listener.close(); void sync?.close(); })
} catch (cause) {
  server?.closeAllConnections(); server?.close(); await sync?.close()
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
