import * as pdf from 'mupdf'
import { LabelLayoutError } from './products'
import type { CutterFonts, PackingRow } from './types'
import type { ShippingLabel } from './extract'

export function textWidth(text: string, font: pdf.Font, size: number) {
  return Array.from(text).reduce((sum, c) => sum + font.advanceGlyph(font.encodeCharacter(c)) * size, 0)
}
export function wrap(text: string, width: number, font: pdf.Font, size: number) {
  const lines: string[] = []
  let current = ''
  for (const word of text.trim().split(/\s+/)) {
    const proposed = `${current} ${word}`.trim()
    if (textWidth(proposed, font, size) <= width) current = proposed
    else {
      if (current) { lines.push(current); current = '' }
      for (const c of word) {
        if (current && textWidth(current + c, font, size) > width) { lines.push(current); current = '' }
        current += c
      }
    }
  }
  if (current) lines.push(current)
  return lines
}
function checkGlyphs(text: string, font: pdf.Font) {
  const missing = [...new Set(Array.from(text).filter(c => !/\s/.test(c) && !font.encodeCharacter(c)))].sort()
  if (missing.length) throw new LabelLayoutError(`Product name contains unsupported font characters: ${missing.map(c => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`).join(', ')}`)
}
export function fittedLines(text: string, font: pdf.Font, width = 273.5, height = 45) {
  checkGlyphs(text, font)
  for (let size = 7.5; size >= 6.5; size -= .25) {
    const lines = wrap(text, width, font, size)
    if (lines.length * size * 1.25 <= height) return { lines, size }
  }
  throw new LabelLayoutError('Full product name does not fit legibly in a four-label sheet; manual review needed.')
}
function putText(text: string, font: pdf.Font, name: string, size: number, x: number, y: number) {
  checkGlyphs(text, font)
  const hex = Array.from(text).map(c => font.encodeCharacter(c).toString(16).padStart(4, '0')).join('')
  return `BT /${name} ${size} Tf 1 0 0 1 ${x} ${842 - y} Tm <${hex}> Tj ET\n`
}
function finish(doc: pdf.PDFDocument, title: string) {
  doc.setMetaData('info:Title', title); doc.setMetaData('info:Creator', 'amazon-labels')
  doc.subsetFonts()
  const buffer = doc.saveToBuffer('garbage=4,compress=yes')
  try { return new Uint8Array(buffer.asUint8Array()) } finally { buffer.destroy() }
}
function fontsFor(doc: pdf.PDFDocument, data: CutterFonts) {
  const normal = new pdf.Font('DejaVuSans', data.normal), bold = new pdf.Font('DejaVuSans-Bold', data.bold)
  return { normal, bold, resources: { normal: doc.addFont(normal), bold: doc.addFont(bold) } }
}
export function renderLabels(labels: ShippingLabel[], fonts: CutterFonts) {
  const doc = new pdf.PDFDocument(), f = fontsFor(doc, fonts)
  try {
    for (let start = 0; start < labels.length; start += 4) {
      let content = ''
      const images: Record<string, pdf.PDFObject> = {}
      for (let j = start; j < Math.min(start + 4, labels.length); j++) {
        const label = labels[j], x = (j % 2) * 297.5, y = Math.floor((j % 4) / 2) * 421, left = x + 23.75
        const scale = 250 / label.width, fullHeight = label.height * scale
        if (label.image.getBitsPerComponent() < 8) {
          // Recreate the Python extractor's lossless PNG round trip. Indexed
          // color expands to sRGB; monochrome retains its original channels.
          const pixels = label.image.toPixmap(), rgb = pixels.getNumberOfComponents() > 1 ? pixels.convertToColorSpace(pdf.ColorSpace.DeviceRGB) : null, image = new pdf.Image(rgb ?? pixels)
          try { images[`L${j}`] = doc.addImage(image) } finally { image.destroy(); rgb?.destroy(); pixels.destroy() }
        } else images[`L${j}`] = doc.addImage(label.image)
        // Clip the original image twice. No page rasterization, resizing of pixels or invoice content.
        function imagePart(top: number, bottom: number, destinationY: number) {
          const imageTop = destinationY - top * scale
          // PyMuPDF serializes its source-to-sheet scale to five decimals.
          // Retain that rounding too, including the 1200px input variant.
          const placedScale = Number(scale.toFixed(5)), base = Number((842 - imageTop - fullHeight).toFixed(5))
          const width = label.width * placedScale, height = label.height * placedScale
          return `q ${left} ${base + (label.height - bottom) * placedScale} ${width} ${(bottom - top) * placedScale} re W n ${width} 0 0 ${height} ${left} ${base} cm /L${j} Do Q\n`
        }
        content += imagePart(0, 1348, y + 5) + imagePart(1500, label.height, y + 352)
        const total = label.products.reduce((sum, p) => sum + p.quantity, 0)
        const heading = label.products.length === 1 ? `QTY: ${total}` : `${label.products.length} PRODUCTS | TOTAL QTY: ${total}`
        if (total > 1) content += `q .94 g 0 G 1 w ${x + 12} ${842 - y - 302} 273.5 15 re B Q\n`
        content += putText(heading, f.bold, 'bold', 10, x + 16, y + 298)
        const description = label.products.length === 1 ? label.products[0].name : label.products.map(p => `[${p.quantity}x] ${p.name}`).join(' ')
        const fitted = fittedLines(description, f.normal)
        fitted.lines.forEach((line, index) => { content += putText(line, f.normal, 'normal', fitted.size, x + 12, y + 305 + fitted.size + index * fitted.size * 1.25) })
      }
      const page = doc.addPage([0, 0, 595, 842], 0, { Font: f.resources, XObject: images }, content)
      doc.insertPage(-1, page); page.destroy(); Object.values(images).forEach(image => image.destroy())
    }
    return finish(doc, 'Amazon Easy Ship labels - full product names')
  } finally { Object.values(f.resources).forEach(r => r.destroy()); f.normal.destroy(); f.bold.destroy(); doc.destroy() }
}
export function renderPackingList(products: PackingRow[], parcels: number, units: number, sources: number, fonts: CutterFonts) {
  const doc = new pdf.PDFDocument(), f = fontsFor(doc, fonts)
  try {
    let content = '', y = 900, pageNumber = 0
    const put = (text: string, x: number, y: number, size: number, bold = false) => putText(text, bold ? f.bold : f.normal, bold ? 'bold' : 'normal', size, x, y)
    function flush() { if (!content) return; const page = doc.addPage([0, 0, 595, 842], 0, { Font: f.resources }, content); doc.insertPage(-1, page); page.destroy(); content = '' }
    products.forEach((row, index) => {
      checkGlyphs(row.product, f.normal)
      const lines = wrap(row.product, 420, f.normal, 9), height = Math.max(36, lines.length * 12 + 15)
      if (height > 690) throw new LabelLayoutError('Product name cannot fit on a packing-list page.')
      if (y + height > 795) {
        flush(); pageNumber++; y = 105
        content += put('PACKING LIST', 30, 35, 17, true) + put(`${parcels} parcels | ${units} ordered units | ${products.length} products`, 30, 54, 10)
        content += put('Quantity counts ordered packs/units; pack contents remain in the product name.', 30, 71, 7.5)
        content += put('#   PRODUCT / VARIANT', 30, 95, 9, true) + put('QTY', 502, 95, 9, true) + put(`Page ${pageNumber} | Sources: ${sources} PDFs`, 30, 819, 8)
      }
      content += `q 0 G .6 w 30 ${842 - y - 13} 8 8 re S Q\n` + put(String(index + 1), 43, y + 12, 8)
      lines.forEach((line, i) => { content += put(line, 65, y + 12 + i * 12, 9) })
      content += put(String(row.quantity), 509, y + 14, 12, true) + `q .75 G .4 w 30 ${842 - y - height + 3} m 563 ${842 - y - height + 3} l S Q\n`
      y += height
    })
    flush()
    return finish(doc, 'Product-wise packing list')
  } finally { Object.values(f.resources).forEach(r => r.destroy()); f.normal.destroy(); f.bold.destroy(); doc.destroy() }
}
export function packingCsv(products: PackingRow[]) {
  const quote = (value: string | number) => /[",\r\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value)
  return '\uFEFF' + [['Product / variant', 'Ordered quantity', 'Parcels'], ...products.map(p => [p.product, p.quantity, p.parcels])].map(row => row.map(quote).join(',')).join('\r\n') + '\r\n'
}
