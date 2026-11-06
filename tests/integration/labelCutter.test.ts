import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import * as pdf from 'mupdf'
import { describe, expect, it } from 'vitest'
import { labelPdf } from '../fixtures/labelPdf'
import { cutShippingLabels } from '../../src/adapters/amazon-labels/cutter'
import { extractLabels } from '../../src/adapters/amazon-labels/extract'
import { groupProducts, productName, rowProducts } from '../../src/adapters/amazon-labels/products'
import { fittedLines } from '../../src/adapters/amazon-labels/render'
const data = (path: string) => new Uint8Array(readFileSync(path)).buffer
const fonts = { normal: data('public/fonts/DejaVuSans.ttf'), bold: data('public/fonts/DejaVuSans-Bold.ttf') }
const input = (options: Parameters<typeof labelPdf>[0] = {}) => ({ name: 'synthetic.pdf', bytes: labelPdf(options).buffer })
const cut = (options: Parameters<typeof labelPdf>[0] = {}) => cutShippingLabels([input(options)], { packingList: true }, fonts)

describe('browser shipping label cutter', () => {
  it('preserves full product names and ordered packs instead of multiplying pack contents', () => {
    expect(productName('Widget (Pack of 2) | B012345678 ( sku ) HSN:1234')).toBe('Widget (Pack of 2)')
    expect(rowProducts('Widget (Pack of 2) | B012345678 ( sku ) HSN:1234', '1')).toEqual([{ name: 'Widget (Pack of 2)', quantity: 1 }])
    for (const qty of ['', '0', '-1', '1.5', '1 2', 'two']) expect(() => rowProducts('Widget | B012345678 ( sku ) HSN:1', qty)).toThrow(/quantity/)
  })
  it('arranges four labels on A4 with lossless original images and no invoice text', async () => {
    const source = input(), labels = extractLabels(source)
    try {
      const result = await cutShippingLabels([source], { packingList: true }, fonts)
      expect([result.labels, result.units, result.pages]).toEqual([2, 8, 1])
      const doc = new pdf.PDFDocument(result.pdf)
      try {
        expect(doc.countPages()).toBe(1)
        const page = doc.loadPage(0), text = page.toStructuredText('')
        expect(page.getBounds()).toEqual([0, 0, 595, 842])
        expect(text.asText()).toContain('2 PRODUCTS | TOTAL QTY: 4')
        expect(text.asText()).toContain('[1x] Widget A (Pack of 2) [3x] Widget C')
        expect(text.asText()).not.toMatch(/HSN:|B012345678|TOTAL:/)
        text.destroy()
        const images: string[] = [], structured = page.toStructuredText('preserve-images')
        structured.walk({ onImageBlock(_r, _m, image) { const p = image.toPixmap(); images.push(createHash('sha256').update(p.getPixels()).digest('hex')); p.destroy(); image.destroy() } })
        expect(images).toHaveLength(4)
        labels.forEach((label, i) => { const p = label.image.toPixmap(); expect(images[i * 2]).toEqual(createHash('sha256').update(p.getPixels()).digest('hex')); expect(images[i * 2 + 1]).toEqual(images[i * 2]); p.destroy() })
        structured.destroy(); page.destroy()
      } finally { doc.destroy() }
      expect(result.packingCsv).toBe('\uFEFFProduct / variant,Ordered quantity,Parcels\r\nWidget A (Pack of 2),2,2\r\nWidget C,6,2\r\n')
      const packing = new pdf.PDFDocument(result.packingPdf!)
      expect(packing.countPages()).toBe(1); packing.destroy()
    } finally { labels.forEach(l => l.image.destroy()) }
  })
  it.each([{ oneBit: true }, { indexed: true }])('expands low-bit-depth images losslessly with matching color channels: %j', async options => {
    const source = input(options), labels = extractLabels(source)
    try {
      const result = await cutShippingLabels([source], { packingList: false }, fonts)
      const doc = new pdf.PDFDocument(result.pdf), page = doc.loadPage(0), structured = page.toStructuredText('preserve-images')
      const expected = labels.map(label => { const p = label.image.toPixmap(); try { return { n: p.getNumberOfComponents(), digest: createHash('sha256').update(p.getPixels()).digest('hex') } } finally { p.destroy() } })
      const actual: typeof expected = []
      structured.walk({ onImageBlock(_r, _m, image) {
        expect(image.getBitsPerComponent()).toBe(options.indexed ? 8 : 1)
        const p = image.toPixmap()
        actual.push({ n: p.getNumberOfComponents(), digest: createHash('sha256').update(p.getPixels()).digest('hex') })
        p.destroy(); image.destroy()
      } })
      expect(actual).toEqual(expected.flatMap(p => [p, p]))
      structured.destroy(); page.destroy(); doc.destroy()
    } finally { labels.forEach(label => label.image.destroy()) }
  })
  it('matches merged product blocks to individual quantity positions', async () => {
    const result = await cut({ merged: true })
    expect(result.units).toBe(12)
    expect(result.products.map(p => [p.product, p.quantity])).toEqual([['Widget A (Pack of 2)', 2], ['Widget B - Blue', 4], ['Widget C', 6]])
    const combined = await cut({ merged: true, sameProduct: true })
    expect(combined.products.map(p => p.quantity)).toEqual([6, 6])
  })
  it('keeps merged products together when only price/quantity columns have internal row borders', async () => {
    const result = await cut({ merged: true, mergedSubrows: true })
    expect(result.products.map(p => p.quantity)).toEqual([2, 4, 6])
  })
  it('supports tax-only continuation rows without dropping another numbered product', async () => {
    expect((await cut({ splitTax: true })).products.map(p => p.quantity)).toEqual([2, 6])
  })
  it('consumes the two ordered business invoice pages without printing invoice content', async () => {
    const result = await cut({ business: true, merged: true })
    expect([result.labels, result.units, result.pages]).toEqual([1, 6, 1])
    await expect(cut({ business: true, wrongBusinessOrder: true })).rejects.toThrow(/business invoice page/)
  })
  it.each([
    [{ merged: true, missingQuantity: true }, /quantity/],
    [{ merged: true, misalignedQuantity: true }, /aligned/],
    [{ merged: true, incompleteProduct: true }, /incomplete/],
    [{ invalidQuantity: true }, /quantity/],
    [{ unnumbered: true }, /row number/],
    [{ wrongImageSize: true }, /dimensions/],
    [{ dirtyGap: true }, /gap/],
    [{ rotation: true }, /unrotated A4/],
    [{ duplicateLabels: true }, /Duplicate shipping label/],
  ] as const)('rejects unsafe input %j atomically', async (options, error) => { await expect(cut(options)).rejects.toThrow(error) })
  it('rejects duplicate files, empty batches and malformed PDFs', async () => {
    const source = input()
    await expect(cutShippingLabels([source, { ...source, name: 'copy.pdf' }], { packingList: false }, fonts)).rejects.toThrow(/same input PDF/)
    await expect(cutShippingLabels([], { packingList: false }, fonts)).rejects.toThrow(/Choose/)
    await expect(cutShippingLabels([{ name: 'bad.pdf', bytes: new ArrayBuffer(0) }], { packingList: false }, fonts)).rejects.toThrow(/No output was created/)
  })
  it('rejects encrypted PDFs', async () => {
    const doc = new pdf.PDFDocument(labelPdf()), buffer = doc.saveToBuffer('encrypt=aes-256,user-password=secret,owner-password=owner')
    const bytes = new Uint8Array(buffer.asUint8Array()).buffer; buffer.destroy(); doc.destroy()
    await expect(cutShippingLabels([{ name: 'locked.pdf', bytes }], { packingList: false }, fonts)).rejects.toThrow(/Password-protected/)
  })
  it('stops on unprintable characters and titles that cannot fit', () => {
    const font = new pdf.Font('DejaVuSans', fonts.normal)
    try {
      expect(() => fittedLines('Widget \u{10ffff}', font)).toThrow(/unsupported font/)
      expect(() => fittedLines('Very long product name '.repeat(100), font)).toThrow(/does not fit legibly/)
    } finally { font.destroy() }
  })
  it('counts one parcel per product even with repeated product rows', () => {
    expect(groupProducts([{ file: 'a.pdf', page: 1, half: 'top', products: [{ name: 'Widget', quantity: 1 }, { name: 'Widget', quantity: 2 }] }])).toEqual([{ product: 'Widget', quantity: 3, parcels: 1 }])
  })
})
