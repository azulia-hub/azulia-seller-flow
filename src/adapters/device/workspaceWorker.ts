let worker: Worker | undefined, sequence = 0
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
function fail() {
  worker?.terminate(); worker = undefined
  for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('Device storage worker stopped. Previously saved data is retained.')) }
  pending.clear()
}
export function workspaceTask<T>(input: { action: 'encode' | 'decode' | 'read' | 'write'; key?: string; value?: unknown; version?: number; raw?: string }): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL('../../workers/deviceWorkspace.worker.ts', import.meta.url), { type: 'module' })
    worker.onerror = fail
    worker.onmessageerror = fail
    worker.onmessage = event => {
      const reply = event.data, item = pending.get(reply.id)
      if (!item) return
      pending.delete(reply.id); clearTimeout(item.timer)
      if (reply.error) item.reject(Object.assign(new Error(reply.error), { status: reply.status })); else item.resolve(reply.value)
    }
  }
  return new Promise<T>((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(fail, 90000)
    pending.set(id, { resolve: value => resolve(value as T), reject, timer })
    try { worker!.postMessage({ ...input, id }) } catch (error) { pending.delete(id); clearTimeout(timer); reject(error) }
  })
}
