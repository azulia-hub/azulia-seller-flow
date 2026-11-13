import { encodeReading, decodeReading } from '../adapters/device/readingCodec'
interface Task { id: number; action: 'encode' | 'decode' | 'read' | 'write'; key?: string; value?: unknown; version?: number; raw?: string }
self.onmessage = async (event: MessageEvent<Task>) => {
  const task = event.data
  try {
    let value: unknown
    if (task.action === 'encode') value = await encodeReading(task.value)
    else if (task.action === 'decode') value = await decodeReading(task.raw!)
    else {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Azulia-Intent': 'device-workspace' }
      let body: BodyInit | undefined
      if (task.action === 'write') {
        const raw = JSON.stringify({ key: task.key, value: task.value, version: task.version })
        body = raw
        if (raw.length > 1024 * 1024 && typeof CompressionStream !== 'undefined') {
          body = await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).blob()
          headers['Content-Encoding'] = 'gzip'
        }
      }
      const response = await fetch(task.action === 'read' ? `/api/device/workspace?key=${encodeURIComponent(task.key!)}` : '/api/device/workspace', {
        method: task.action === 'read' ? 'GET' : 'POST', cache: 'no-store', headers, body, signal: AbortSignal.timeout(60000),
      })
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { error?: string } | null
        throw Object.assign(new Error(detail?.error || 'Device storage operation failed. Previously saved data is retained.'), { status: response.status })
      }
      value = await response.json()
    }
    self.postMessage({ id: task.id, value })
  } catch (error) { const cause = error as Error & { status?: number }; self.postMessage({ id: task.id, error: cause.message, status: cause.status }) }
}
