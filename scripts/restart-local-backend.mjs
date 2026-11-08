/** Replace only this repository's running local entry point. Preserve caches and credentials. */
import { readdir, readFile, readlink, realpath, access, mkdir, open, writeFile } from 'node:fs/promises'
import { resolve, basename } from 'node:path'
import { spawn } from 'node:child_process'
const repository = await realpath(new URL('../', import.meta.url).pathname)
const entry = resolve(repository, 'server/local/start.ts')
await access(resolve(repository, 'dist/index.html'))
const targets = []
for (const pid of await readdir('/proc')) {
  if (!/^\d+$/.test(pid) || Number(pid) === process.pid) continue
  try {
    const args = (await readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0').filter(Boolean)
    if (!['node','nodejs'].includes(basename(args[0] ?? ''))) continue
    const cwd = await realpath(await readlink(`/proc/${pid}/cwd`))
    if (cwd !== repository || !args.slice(1).some(arg => !arg.startsWith('-') && resolve(cwd, arg) === entry)) continue
    targets.push(Number(pid))
  } catch { /* Other applications are outside this restart's scope. */ }
}
if (targets.length > 1) throw new Error('More than one matching backend exists; refusing an ambiguous restart.')
for (const pid of targets) process.kill(pid, 'SIGTERM')
for (let attempts = 0; attempts < 50 && targets.some(pid => { try { process.kill(pid, 0); return true } catch { return false } }); attempts++) await new Promise(resolve => setTimeout(resolve, 100))
if (targets.some(pid => { try { process.kill(pid, 0); return true } catch { return false } })) throw new Error('Existing backend has not stopped; no replacement was started.')
await mkdir(resolve(repository, '.local'), { recursive: true, mode: 0o700 })
const log = await open(resolve(repository, '.local/backend.log'), 'a', 0o600)
const child = spawn(process.execPath, ['--experimental-strip-types', entry], { cwd: repository, detached: true, stdio: ['ignore', log.fd, log.fd] })
await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject) })
child.unref(); await log.close()
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    const response = await fetch('http://127.0.0.1:8788/api/report-sync/status', { signal: AbortSignal.timeout(1000) })
    if (response.ok) { const status = await response.json(); if ('orderDateIssues' in status) { await writeFile(resolve(repository, '.local/backend.pid'), String(child.pid), { mode: 0o600 }); console.log(JSON.stringify({ restarted: targets.length === 1, backendPid: child.pid, financialRecords: status.records, pendingOrderDates: status.pendingOrderDates, pendingOrderCycles: status.pendingOrderCycles, orderDatesError: status.orderDatesError })); process.exit(0) } }
  } catch { /* Wait briefly for the new loopback listener. */ }
  await new Promise(resolve => setTimeout(resolve, 500))
}
throw new Error('Updated backend did not become ready; inspect .local/backend.log locally.')
