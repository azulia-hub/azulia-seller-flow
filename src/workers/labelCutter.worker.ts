import wasmUrl from '../../node_modules/mupdf/dist/mupdf-wasm.wasm?url'
import type { CutterInput, CutterFonts, CutterOptions, CutterMessage } from '../adapters/amazon-labels/types'

// Configure the self-hosted WASM asset before the PDF binding is evaluated.
Object.assign(globalThis, { $libmupdf_wasm_Module: { locateFile: () => wasmUrl } })
const send = (message: CutterMessage, transfer: Transferable[] = []) => self.postMessage(message, { transfer })
self.onmessage = async (event: MessageEvent<{ inputs: CutterInput[]; options: CutterOptions; fonts: CutterFonts }>) => {
  try {
    const { cutShippingLabels } = await import('../adapters/amazon-labels/cutter')
    const result = await cutShippingLabels(event.data.inputs, event.data.options, event.data.fonts, message => send({ type: 'progress', message }))
    const transfer: Transferable[] = [result.pdf.buffer]
    if (result.packingPdf) transfer.push(result.packingPdf.buffer)
    send({ type: 'done', result }, transfer)
  } catch (error) { send({ type: 'error', message: error instanceof Error ? error.message : String(error) }) }
}
