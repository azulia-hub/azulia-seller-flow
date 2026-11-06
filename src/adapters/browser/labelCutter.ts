import type { CutterMessage, CutterOptions, CutterResult } from '../amazon-labels/types'

export function startLabelCutter(files: File[], options: CutterOptions, progress: (message: string) => void) {
  const controller = new AbortController()
  let worker: Worker | undefined, rejectJob: (reason: Error) => void = () => {}
  const result = new Promise<CutterResult>((resolve, reject) => {
    rejectJob = reject
    void (async () => {
      progress('Loading PDF tools…')
      const loadFont = async (name: string) => {
        const response = await fetch(`${import.meta.env.BASE_URL}fonts/${name}.ttf`, { signal: controller.signal }).catch(error => {
          if (controller.signal.aborted) throw error
          throw new Error('PDF tools could not load. Connect to the internet and try again.')
        })
        if (!response.ok) throw new Error('PDF fonts could not load. Reconnect and try again.')
        return response.arrayBuffer()
      }
      const [inputs, normal, bold] = await Promise.all([
        Promise.all(files.map(async file => ({ name: file.name, bytes: await file.arrayBuffer() }))),
        loadFont('DejaVuSans'), loadFont('DejaVuSans-Bold'),
      ])
      if (controller.signal.aborted) return
      worker = new Worker(new URL('../../workers/labelCutter.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<CutterMessage>) => {
        const message = event.data
        if (message.type === 'progress') progress(message.message)
        else {
          worker?.terminate()
          if (message.type === 'done') resolve(message.result)
          else reject(new Error(message.message))
        }
      }
      worker.onerror = () => { worker?.terminate(); reject(new Error('The PDF tool could not finish. Try a smaller batch or reload the page.')) }
      worker.postMessage({ inputs, options, fonts: { normal, bold } }, [...inputs.map(input => input.bytes), normal, bold])
    })().catch(reject)
  })
  return { result, cancel() { controller.abort(); worker?.terminate(); rejectJob(new DOMException('Cancelled', 'AbortError')) } }
}
