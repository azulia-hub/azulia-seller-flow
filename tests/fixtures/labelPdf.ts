import * as pdf from 'mupdf'

export interface LabelFixtureOptions {
  oneBit?: boolean
  indexed?: boolean
  merged?: boolean
  sameProduct?: boolean
  invalidQuantity?: boolean
  misalignedQuantity?: boolean
  missingQuantity?: boolean
  incompleteProduct?: boolean
  unnumbered?: boolean
  splitTax?: boolean
  mergedSubrows?: boolean
  business?: boolean
  wrongBusinessOrder?: boolean
  duplicateLabels?: boolean
  rotation?: boolean
  wrongImageSize?: boolean
  dirtyGap?: boolean
  longTitle?: boolean
  labelId?: number
}
/** Fictional invoice and generated label image: never embeds private seller/customer data. */
export function labelPdf(options: LabelFixtureOptions = {}) {
  const doc = new pdf.PDFDocument(), font = new pdf.Font('Helvetica')
  const fontRef = doc.addSimpleFont(font)
  const text = (x: number, y: number, value: string, size = 6) => `BT /F ${size} Tf 1 0 0 1 ${x} ${842 - y} Tm (${value.replace(/[\\()]/g, '\\$&')}) Tj ET\n`
  const rect = (x: number, y: number, width: number, height: number, fill = false) => `q ${fill ? '.9 g' : '0 G .3 w'} ${x} ${842 - y - height} ${width} ${height} re ${fill ? 'f' : 'S'} Q\n`
  const line = (x: number, y: number, x2: number, y2: number) => `q 0 G .3 w ${x} ${842 - y} m ${x2} ${842 - y2} l S Q\n`
  function invoice() {
    const xs = [316, 326, 450, 480, 490, 594], ys = options.mergedSubrows ? [200, 214, 246, 286, 320, 340] : options.splitTax ? [200, 214, 286, 300, 320, 340] : [200, 214, 286, 320, 340]
    let content = ''
    for (let i = 0; i < xs.length - 1; i++) content += rect(xs[i], 200, xs[i + 1] - xs[i], 14, true)
    for (const x of xs) for (let j = 0; j < ys.length - 1; j++) { if (ys[j] === 320 && x !== 316 && x !== 594) continue; content += line(x, ys[j], x, ys[j + 1]) }
    for (const y of ys) content += line(options.mergedSubrows && y === 246 ? 450 : 316, y, 594, y)
    for (const [x, title] of [[317, 'No'], [327, 'Description'], [451, 'Price'], [481, 'Qty'], [495, 'Amount']] as const) content += text(x, 209, title)
    if (!options.unnumbered) content += text(320, 225, '1')
    content += text(327, 225, options.longTitle ? 'LongProduct'.repeat(150) : 'Widget A (Pack of 2)') + text(327, 233, '| B012345678 ( sku-a )') + text(327, 241, 'HSN:1234')
    content += text(482, options.misalignedQuantity ? 248 : 233, options.invalidQuantity ? '0' : '1')
    if (options.merged) {
      content += text(327, 257, options.sameProduct ? 'Widget A (Pack of 2)' : 'Widget B - Blue') + text(327, 265, options.sameProduct ? '| B012345678 ( sku-a )' : '| B012345679 ( sku-b )')
      if (!options.incompleteProduct) content += text(327, 273, 'HSN:1234')
      if (!options.missingQuantity) content += text(482, 265, '2')
    }
    if (options.splitTax) content += text(500, 295, 'Tax')
    content += text(320, 307, '2') + text(327, 307, 'Widget C') + text(327, 313, '| B012345680 ( sku-c ) HSN:1234') + text(482, 313, '3') + text(316, 328, 'TOTAL:')
    return content
  }
  const imageWidth = options.wrongImageSize ? 1100 : 1216
  function addLabel(id: number) {
    const pixmap = new pdf.Pixmap(pdf.ColorSpace.DeviceGray, [0, 0, imageWidth, 1824], false)
    pixmap.clear(255)
    const pixels = pixmap.getPixels()
    // Distinct synthetic barcode-like stripes above/below the protected gap.
    for (let y = 50; y < 110; y++) for (let x = 50; x < 800; x++) if ((x + id) % (id + 5) < 2) pixels[y * imageWidth + x] = 0
    pixels[100 * imageWidth + 100 + id] = id
    if (options.dirtyGap) pixels[1400 * imageWidth + 100] = 0
    if (options.oneBit || options.indexed) {
      const packed = new Uint8Array(imageWidth * 1824 / 8)
      for (let i = 0; i < pixels.length; i++) if (pixels[i] > 127) packed[i >> 3] |= 1 << (7 - (i % 8))
      const palette = doc.newByteString(new Uint8Array([0, 0, 0, 255, 255, 255]))
      const colorspace = options.indexed ? ['Indexed', ['CalRGB', { Gamma: [2.2, 2.2, 2.2], WhitePoint: [.95043, 1, 1.09], Matrix: [.41239, .21264, .01933, .35758, .71517, .11919, .18045, .07218, .9504] }], 1, palette] : 'DeviceGray'
      const ref = doc.addStream(packed, { Type: 'XObject', Subtype: 'Image', Width: imageWidth, Height: 1824, BitsPerComponent: 1, ColorSpace: colorspace })
      palette.destroy(); pixmap.destroy()
      return ref
    }
    const image = new pdf.Image(pixmap), ref = doc.addImage(image)
    image.destroy(); pixmap.destroy()
    return ref
  }
  const refs: pdf.PDFObject[] = []
  function addPage(content: string, images: Record<string, pdf.PDFObject> = {}) {
    const page = doc.addPage([0, 0, 595, 842], options.rotation ? 90 : 0, { Font: { F: fontRef }, XObject: images }, content)
    doc.insertPage(-1, page); page.destroy()
  }
  try {
    const image = addLabel(options.labelId ?? 1); refs.push(image)
    const imageContent = 'q 250 0 0 375 20 457 cm /Label Do Q\n'
    if (options.business) {
      addPage(imageContent, { Label: image })
      for (const number of options.wrongBusinessOrder ? [2, 1] : [1, 2]) addPage(text(30, 30, 'Tax Invoice/Bill of Supply/Cash Memo', 10) + text(30, 45, `Page ${number} of 2`, 10) + (number === 1 ? invoice() : ''))
    } else {
      const second = options.duplicateLabels ? image : addLabel((options.labelId ?? 1) + 1)
      if (second !== image) refs.push(second)
      addPage(imageContent + invoice() + 'q 1 0 0 1 0 -421 cm\n' + imageContent.replace('/Label', '/Second') + invoice() + 'Q\n', { Label: image, Second: second })
    }
    const buffer = doc.saveToBuffer('compress=yes')
    try { return new Uint8Array(buffer.asUint8Array()) } finally { buffer.destroy() }
  } finally { refs.forEach(r => r.destroy()); fontRef.destroy(); font.destroy(); doc.destroy() }
}
