/** Queue the requested reference period through the existing loopback backend. No credential access. */
import { writeFile, mkdir } from 'node:fs/promises'
const base = 'http://127.0.0.1:8788'
const status = async () => {
  const response = await fetch(`${base}/api/report-sync/status`, { signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error(`Local status failed (${response.status}).`)
  return response.json()
}
const initial = await status()
if (!initial.configured) throw new Error('Configure the local backend first.')
const response = await fetch(`${base}/api/report-sync/range`, { method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json', 'X-Azulia-Intent': 'sync-report', Origin: base }, body: JSON.stringify({ connectionKey: initial.connectionKey, from: '2026-01-31T18:30:00.000Z', to: '2026-10-31T18:30:00.000Z' }) })
if (!response.ok) throw new Error(`History request failed (${response.status}).`)
await mkdir('.local/reconciliation', { recursive: true, mode: 0o700 })
const deadline = Date.now() + 15 * 60000
let previous = '', stable = 0
while (Date.now() < deadline) {
  const current = await status()
  if (current.connectionKey !== initial.connectionKey) throw new Error('Account changed; comparison download stopped.')
  const summary = { at: new Date().toISOString(), records: current.records, missingWindows: current.missingWindows, state: current.state, error: current.error, orderDatesError: current.orderDatesError, coverage: current.coverage }
  await writeFile('.local/reconciliation/history-progress.json', JSON.stringify(summary, null, 2), { mode: 0o600 })
  const key = JSON.stringify([current.records, current.missingWindows, current.error])
  if (key !== previous) { console.log(JSON.stringify(summary)); previous = key }
  if (current.error && current.state === 'error') throw new Error(current.error)
  stable = current.missingWindows === 0 ? stable + 1 : 0
  if (stable >= 2) { console.log('Requested financial history coverage complete.'); process.exit(0) }
  await new Promise(resolve => setTimeout(resolve, 10000))
}
throw new Error('History is still downloading; progress is saved locally. The backend continues independently.')
