import { extractLabels, type ShippingLabel } from './extract'
import { groupProducts, LabelLayoutError } from './products'
import { packingCsv, renderLabels, renderPackingList } from './render'
import type { CutterInput, CutterOptions, CutterFonts, CutterResult } from './types'

export async function cutShippingLabels(inputs: CutterInput[], options: CutterOptions, fonts: CutterFonts, progress: (message: string) => void = () => {}): Promise<CutterResult> {
  if (!inputs.length) throw new LabelLayoutError('Choose at least one original Amazon PDF.')
  const labels: ShippingLabel[] = [], sources: CutterResult['sources'] = [], seen = new Map<string, string>(), files = new Set<string>()
  const digest = async (data: Uint8Array<ArrayBuffer>) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data))).map(b => b.toString(16).padStart(2, '0')).join('')
  try {
    for (const input of inputs) {
      progress(`Reading ${input.name}…`)
      try {
        const fileDigest = await digest(new Uint8Array(input.bytes))
        if (files.has(fileDigest)) throw new LabelLayoutError('The same input PDF was supplied more than once.')
        files.add(fileDigest)
        const batch = extractLabels(input)
        labels.push(...batch)
        for (const label of batch) {
          const pixels = label.image.toPixmap()
          let hash: string
          try { hash = await digest(new Uint8Array(pixels.getPixels())) } finally { pixels.destroy() }
          const location = `${label.file}, page ${label.page}, ${label.half}`
          if (seen.has(hash)) throw new LabelLayoutError(`Duplicate shipping label: ${location}; already present in ${seen.get(hash)}.`)
          seen.set(hash, location)
        }
        sources.push({ name: input.name, labels: batch.length })
      } catch (error) { throw new LabelLayoutError(`${input.name}: ${error instanceof Error ? error.message : String(error)}\nNo output was created. Review this file first.`) }
    }
    progress('Arranging labels on A4 sheets…')
    const products = groupProducts(labels), units = products.reduce((sum, p) => sum + p.quantity, 0)
    const result: CutterResult = { pdf: renderLabels(labels, fonts), labels: labels.length, units, pages: Math.ceil(labels.length / 4), sources, products }
    if (options.packingList) {
      progress('Creating packing list…')
      result.packingPdf = renderPackingList(products, labels.length, units, inputs.length, fonts)
      result.packingCsv = packingCsv(products)
    }
    return result
  } finally { labels.forEach(label => label.image.destroy()) }
}
