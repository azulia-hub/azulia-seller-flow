import { androidDevice } from '../../adapters/device/bridge'
interface DownloadPort { postMessage(message: string): void; onmessage: ((event: { data: string }) => void) | null }
declare global { interface Window { AzuliaDownloads?: DownloadPort } }
const maximumBytes = 128 * 1024 * 1024
let bound: DownloadPort | undefined
const pending = new Map<string, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
function request(action: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const port = window.AzuliaDownloads
  if (!port) return Promise.reject(new Error('Install the updated APK to save generated files on Android.'))
  if (bound !== port) {
    bound = port
    port.onmessage = event => {
      try {
        const response = JSON.parse(event.data), item = pending.get(response.id)
        if (!item) return
        pending.delete(response.id); clearTimeout(item.timer)
        if (response.error) item.reject(new Error(response.error)); else item.resolve(response.result ?? {})
      } catch { /* Unrelated messages do not finish a save. */ }
    }
  }
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID()
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Saving timed out. Close the Save file dialog and try again.')) }, action === 'finish' ? 10 * 60 * 1000 : 60000)
    pending.set(id, { resolve, reject, timer })
    try { port.postMessage(JSON.stringify({ id, action, ...payload })) }
    catch { pending.delete(id); clearTimeout(timer); reject(new Error('Could not contact Android to save this file.')) }
  })
}
/** Bounded transfers avoid building a second full base64 copy of a large PDF. */
export async function saveGeneratedFile(data: Uint8Array<ArrayBuffer> | string, name: string, mime: string): Promise<'saved' | 'requested' | 'cancelled'> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  if (!bytes.byteLength) throw new Error('This generated file is empty. Prepare the labels again.')
  if (bytes.byteLength > maximumBytes) throw new Error('This file exceeds the 128 MB save limit. Prepare a smaller batch.')
  if (androidDevice) {
    const started = await request('begin', { name, mime, size: bytes.byteLength })
    const token = started.token
    if (typeof token !== 'string') throw new Error('Android could not prepare the file save.')
    try {
      for (let offset = 0; offset < bytes.byteLength; offset += 65536) {
        const chunk = bytes.subarray(offset, Math.min(offset + 65536, bytes.byteLength))
        let binary = ''
        for (let i = 0; i < chunk.length; i++) binary += String.fromCharCode(chunk[i])
        await request('chunk', { token, offset, data: btoa(binary) })
      }
      const result = await request('finish', { token })
      if (result.cancelled === true) return 'cancelled'
      if (result.saved !== true) throw new Error('Android did not confirm the file was saved.')
      return 'saved'
    } catch (error) {
      void request('cancel', { token }).catch(() => undefined)
      throw error
    }
  }
  // Trigger directly from the button gesture; retain the URL long enough for browsers to consume it.
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
  const link = document.createElement('a')
  link.href = url; link.download = name; link.style.display = 'none'
  document.body.appendChild(link)
  try { link.click() } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000) }
  return 'requested' // Browsers do not expose a reliable disk-save completion signal.
}
