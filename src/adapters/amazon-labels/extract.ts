import * as pdf from 'mupdf'
import { cellText, contains, LabelLayoutError, rowProducts } from './products'
import type { Product, Rect, Word, LabelSummary } from './types'

export interface ShippingLabel extends LabelSummary { image: pdf.Image; width: number; height: number }
interface PageEvidence { words: Word[]; fills: Rect[]; vertical: Rect[]; horizontal: Rect[]; images: { image: pdf.Image; rect: Rect }[]; text: string }

function evidence(page: pdf.PDFPage): PageEvidence {
  const words: Word[] = [], images: PageEvidence['images'] = []
  const structured = page.toStructuredText('preserve-images,preserve-whitespace')
  let text = '', rect: Rect | null = null
  function endWord() { if (text && rect) words.push({ text, rect }); text = ''; rect = null }
  structured.walk({
    onChar(c, _origin, _font, _size, q) {
      if (/\s/.test(c)) { endWord(); return }
      const r: Rect = [Math.min(q[0], q[2], q[4], q[6]), Math.min(q[1], q[3], q[5], q[7]), Math.max(q[0], q[2], q[4], q[6]), Math.max(q[1], q[3], q[5], q[7])]
      text += c
      rect = rect ? [Math.min(rect[0], r[0]), Math.min(rect[1], r[1]), Math.max(rect[2], r[2]), Math.max(rect[3], r[3])] : r
    },
    endLine: endWord, endTextBlock: endWord,
    onImageBlock(rect, _matrix, image) { images.push({ rect, image }) },
  })
  endWord()
  const allText = structured.asText()
  structured.destroy()
  const fills: Rect[] = [], vertical: Rect[] = [], horizontal: Rect[] = []
  function edge(a: pdf.Point, b: pdf.Point) {
    const r: Rect = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]
    if (r[2] - r[0] < 1 && r[3] - r[1] > 3) vertical.push(r)
    if (r[3] - r[1] < 1 && r[2] - r[0] > 3) horizontal.push(r)
  }
  function pathEvidence(path: pdf.Path, matrix: pdf.Matrix, fill: boolean) {
    const points: pdf.Point[] = []
    let start: pdf.Point | null = null, prior: pdf.Point | null = null, curved = false
    const point = (x: number, y: number): pdf.Point => [x * matrix[0] + y * matrix[2] + matrix[4], x * matrix[1] + y * matrix[3] + matrix[5]]
    path.walk({
      moveTo(x, y) { start = prior = point(x, y); points.push(prior) },
      lineTo(x, y) { const next = point(x, y); if (prior) edge(prior, next); points.push(next); prior = next },
      closePath() { if (start && prior) edge(prior, start); prior = start },
      curveTo() { curved = true },
    })
    if (!curved && points.length && fill) {
      const r: Rect = [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))]
      fills.push(r)
      if (r[2] - r[0] < 1 && r[3] - r[1] > 3) vertical.push(r)
      if (r[3] - r[1] < 1 && r[2] - r[0] > 3) horizontal.push(r)
    }
  }
  const device = new pdf.Device({ fillPath(path, _eo, matrix) { pathEvidence(path, matrix, true) }, strokePath(path, _stroke, matrix) { pathEvidence(path, matrix, false) } })
  try { page.runPageContents(device, pdf.Matrix.identity); device.close() } finally { device.destroy() }
  return { words, images, fills, vertical, horizontal, text: allText }
}
function headerCell(data: PageEvidence, word: Word): Rect {
  const x = (word.rect[0] + word.rect[2]) / 2, y = (word.rect[1] + word.rect[3]) / 2
  const cells = data.fills.filter(r => r[2] - r[0] > 3 && r[3] - r[1] > 4 && contains(r, x, y)).sort((a, b) => (a[2] - a[0]) * (a[3] - a[1]) - (b[2] - b[0]) * (b[3] - b[1]))
  if (cells.length) return cells[0]
  // Alternate tables use stroked grid lines rather than filled cell rectangles.
  const sides = data.vertical.filter(r => r[1] <= y + .5 && r[3] >= y - .5)
  const left = sides.filter(r => r[0] < x).sort((a, b) => b[0] - a[0])[0]
  const right = sides.filter(r => r[2] > x).sort((a, b) => a[2] - b[2])[0]
  if (!left || !right) throw new LabelLayoutError('Missing invoice header cell borders.')
  const borders = data.horizontal.filter(r => r[0] <= left[0] + 1 && r[2] >= right[2] - 1)
  const top = borders.filter(r => r[1] < y).sort((a, b) => b[1] - a[1])[0]
  const bottom = borders.filter(r => r[3] > y).sort((a, b) => a[3] - b[3])[0]
  if (!top || !bottom) throw new LabelLayoutError('Missing invoice header cell borders.')
  return [left[0], top[1], right[2], bottom[3]]
}
export function invoiceProducts(data: PageEvidence, clip: Rect): Product[] {
  const descriptions = data.words.filter(w => w.text === 'Description' && contains(clip, w.rect[0], w.rect[1]))
  const quantities = data.words.filter(w => w.text === 'Qty' && contains(clip, w.rect[0], w.rect[1]))
  if (descriptions.length !== 1 || quantities.length !== 1) throw new LabelLayoutError('Expected one product table with Description and Qty headers.')
  const description = headerCell(data, descriptions[0]), qty = headerCell(data, quantities[0])
  if (Math.abs(description[3] - qty[3]) > .5) throw new LabelLayoutError('Invoice columns are misaligned.')
  const products: Product[] = []
  let boundary = qty[3], expectedRow = 1
  const vertical = data.vertical.filter(r => r[0] >= clip[0] - 1 && r[2] <= clip[2] + 1)
  for (let limit = 0; limit < 1000; limit++) {
    const total = data.words.filter(w => w.text === 'TOTAL:' && contains(clip, w.rect[0], w.rect[1]) && Math.abs(w.rect[1] - boundary) < 8)
    if (total.length && products.length) return products
    // A product cell may span several price/tax/quantity subrows. Only a
    // horizontal border across the description column ends the product row.
    const rowEnds = data.horizontal.filter(r => r[0] <= description[0] + .6 && r[2] >= description[2] - .6 && r[1] > boundary + .6 && r[3] <= clip[3]).sort((a, b) => a[1] - b[1])
    if (!rowEnds.length) break
    const bottom = rowEnds[0][1]
    for (const x of [qty[0], qty[2], description[0], description[2]]) {
      const segments = vertical.filter(r => Math.min(Math.abs(r[0] - x), Math.abs(r[2] - x)) < .6 && r[3] > boundary && r[1] < bottom).sort((a, b) => a[1] - b[1])
      let covered = boundary
      for (const segment of segments) {
        if (segment[1] > covered + .6) break
        covered = Math.max(covered, segment[3])
      }
      if (covered < bottom - .6) throw new LabelLayoutError('Missing product cell border.')
    }
    const serial = cellText(data.words, [description[0] - 9, boundary, description[0], bottom])
    const dr: Rect = [description[0], boundary, description[2], bottom], qr: Rect = [qty[0], boundary, qty[2], bottom]
    const title = cellText(data.words, dr), amount = cellText(data.words, qr)
    // Split tax rows can continue below a product without another product or quantity.
    // Inspect all three product cells; never skip an unnumbered description or quantity.
    if (!serial && !title && !amount && products.length) { boundary = bottom; continue }
    if (serial !== String(expectedRow)) throw new LabelLayoutError('Product row number or quantity is ambiguous.')
    products.push(...rowProducts(title, amount, data.words, dr, qr))
    boundary = bottom; expectedRow++
  }
  throw new LabelLayoutError('Product table is incomplete; its total row was not reached.')
}
function validatePage(page: pdf.PDFPage) {
  const bounds = page.getBounds(), rotation = page.getObject().getInheritable('Rotate').asNumber()
  if (rotation || Math.abs(bounds[0]) > 1 || Math.abs(bounds[1]) > 1 || Math.abs(bounds[2] - 595) > 1 || Math.abs(bounds[3] - 842) > 1) throw new LabelLayoutError('Expected unrotated A4, two-label layout.')
}
function businessProducts(doc: pdf.PDFDocument, index: number): Product[] {
  if (index + 2 >= doc.countPages()) throw new LabelLayoutError('Standalone label requires two following business invoice pages.')
  const candidates: Product[][] = []
  for (let number = 1; number <= 2; number++) {
    const page = doc.loadPage(index + number)
    try {
      validatePage(page)
      const data = evidence(page)
      try {
        if (!data.text.includes('Tax Invoice/Bill of Supply/Cash Memo') || !new RegExp(`\\bPage\\s+${number}\\s+of\\s+2\\b`).test(data.text) || data.images.some(i => i.image.getWidth() >= 1000 && i.image.getHeight() >= 1500)) throw new LabelLayoutError(`Invalid business invoice page ${number} of 2 after standalone label.`)
        if (data.words.some(w => w.text === 'Description')) candidates.push(invoiceProducts(data, [0, 0, 595, 842]))
      } finally { data.images.forEach(i => i.image.destroy()) }
    } finally { page.destroy() }
  }
  if (candidates.length !== 1) throw new LabelLayoutError(`Expected one complete business product table; found ${candidates.length}.`)
  return candidates[0]
}
export function extractLabels(input: { name: string; bytes: ArrayBuffer }): ShippingLabel[] {
  const doc = new pdf.PDFDocument(input.bytes), labels: ShippingLabel[] = []
  try {
    if (doc.needsPassword()) throw new LabelLayoutError('Password-protected PDF is not supported.')
    for (let index = 0; index < doc.countPages(); index++) {
      const page = doc.loadPage(index)
      try {
        validatePage(page)
        const data = evidence(page), kept = new Set<pdf.Image>()
        try {
          const standalone = data.images.length === 1 && !data.text.trim() && data.images[0].rect[0] < 297.5 && data.images[0].rect[1] < 421 && data.images[0].image.getWidth() >= 1000 && data.images[0].image.getHeight() >= 1500
          const products = standalone ? businessProducts(doc, index) : null
          for (const top of [0, 421]) {
            const half = top ? 'bottom' : 'top'
            try {
              const images = data.images.filter(i => i.rect[0] >= 0 && i.rect[0] < 297.5 && i.rect[1] >= top && i.rect[1] < top + 421 && i.image.getWidth() >= 1000 && i.image.getHeight() >= 1500)
              if (!images.length) {
                if (cellText(data.words, [298, top, 595, top + 421]).trim() || data.images.some(i => i.rect[0] < 297.5 && i.rect[1] >= top && i.rect[1] < top + 421)) throw new LabelLayoutError('Missing/unsupported label image.')
                continue
              }
              if (images.length !== 1) throw new LabelLayoutError('Multiple label images.')
              const image = images[0].image, width = image.getWidth(), height = image.getHeight()
              if (!((width === 1216 && height === 1824) || (width === 1200 && height === 1800))) throw new LabelLayoutError('Unsupported label image dimensions.')
              const items = products ?? invoiceProducts(data, [310, top + 185, 594, top + 405])
              const pixels = image.toPixmap()
              try {
                const samples = pixels.getPixels(), stride = pixels.getStride(), n = pixels.getNumberOfComponents()
                for (let row = 1348; row < 1500; row++) for (let offset = row * stride + 48 * n; offset < row * stride + (width - 48) * n; offset++) if (samples[offset] !== 255) throw new LabelLayoutError('Product gap contains original content.')
              } finally { pixels.destroy() }
              labels.push({ file: input.name, page: index + 1, half, image, width, height, products: items }); kept.add(image)
            } catch (error) { throw new LabelLayoutError(`Page ${index + 1}, ${half}: ${error instanceof Error ? error.message : String(error)}`) }
          }
          if (standalone) index += 2
        } finally { data.images.filter(i => !kept.has(i.image)).forEach(i => i.image.destroy()) }
      } finally { page.destroy() }
    }
    if (!labels.length) throw new LabelLayoutError('No shipping labels found.')
    return labels
  } catch (error) { labels.forEach(l => l.image.destroy()); throw error } finally { doc.destroy() }
}
