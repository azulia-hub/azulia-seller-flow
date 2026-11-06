import type { Product, Word, Rect, PackingRow, LabelSummary } from './types'

export class LabelLayoutError extends Error {}
export const contains = (r: Rect, x: number, y: number) => r[0] <= x && x <= r[2] && r[1] <= y && y <= r[3]
export function cellWords(words: readonly Word[], rect: Rect) {
  return words.filter(w => contains(rect, (w.rect[0] + w.rect[2]) / 2, (w.rect[1] + w.rect[3]) / 2))
}
export function cellText(words: readonly Word[], rect: Rect) {
  return cellWords(words, rect).sort((a, b) => Math.round(a.rect[1] * 10) - Math.round(b.rect[1] * 10) || a.rect[0] - b.rect[0]).map(w => w.text).join(' ')
}
export function productName(description: string) {
  const text = description.replace(/\s+/g, ' ').split(/\bHSN\s*:/i)[0].trim()
  const match = /\s*\|?\s*\bB0[A-Z0-9]{8}\b\s*\([^)]*\)\s*$/.exec(text)
  if (!match) throw new LabelLayoutError('Product title has no recognized ASIN/SKU ending; manual review needed.')
  const name = text.slice(0, match.index).replace(/^[ |]+|[ |]+$/g, '')
  if (!name) throw new LabelLayoutError('Product name is empty.')
  return name
}
function quantity(text: string) {
  if (!/^[1-9][0-9]*$/.test(text.trim()) || !Number.isSafeInteger(Number(text))) throw new LabelLayoutError('Invoice contains an invalid or ambiguous item quantity.')
  return Number(text)
}
function lines(words: readonly Word[], rect: Rect) {
  const groups: Word[][] = []
  for (const w of cellWords(words, rect).sort((a, b) => a.rect[1] - b.rect[1] || a.rect[0] - b.rect[0])) {
    if (!groups.length || Math.abs(w.rect[1] - groups.at(-1)![0].rect[1]) > 1) groups.push([])
    groups.at(-1)!.push(w)
  }
  return groups.map(g => ({ top: Math.min(...g.map(w => w.rect[1])), bottom: Math.max(...g.map(w => w.rect[3])), text: g.sort((a, b) => a.rect[0] - b.rect[0]).map(w => w.text).join(' ') }))
}
export function rowProducts(description: string, amount: string, words?: readonly Word[], descriptionRect?: Rect, quantityRect?: Rect): Product[] {
  const count = (description.match(/\bB0[A-Z0-9]{8}\b/g) ?? []).length
  if (count <= 1) return [{ name: productName(description), quantity: quantity(amount) }]
  if (!words || !descriptionRect || !quantityRect) throw new LabelLayoutError('Merged product row requires quantity positions for safe extraction.')
  const blocks: ReturnType<typeof lines>[] = [], pending: ReturnType<typeof lines> = []
  for (const line of lines(words, descriptionRect)) {
    pending.push(line)
    if (/\bHSN\s*:\s*\d+\b/i.test(line.text)) blocks.push(pending.splice(0))
  }
  if (pending.length || blocks.length !== count) throw new LabelLayoutError('Merged product descriptions are incomplete or ambiguous.')
  const amounts = lines(words, quantityRect)
  if (amounts.length !== count || amounts.map(l => l.text).join(' ') !== amount.trim().split(/\s+/).join(' ')) throw new LabelLayoutError('Merged product row has an ambiguous item quantity count.')
  const products = new Map<string, Product>(), used = new Set<number>()
  for (const block of blocks) {
    const text = block.map(l => l.text).join(' '), name = productName(text)
    const ids = [...text.matchAll(/\b(B0[A-Z0-9]{8})\b\s*\(([^)]*)\)/g)]
    if (ids.length !== 1) throw new LabelLayoutError('Merged product identifier is ambiguous.')
    const top = Math.min(...block.map(l => l.top)), bottom = Math.max(...block.map(l => l.bottom))
    const matches = amounts.flatMap((l, i) => (l.top + l.bottom) / 2 >= top - .5 && (l.top + l.bottom) / 2 <= bottom + .5 ? [i] : [])
    if (matches.length !== 1 || used.has(matches[0])) throw new LabelLayoutError('Merged product quantity is not uniquely aligned with its description.')
    used.add(matches[0])
    const key = JSON.stringify([name, ids[0][1], ids[0][2].trim().replace(/\s+/g, ' ')])
    const prior = products.get(key)
    products.set(key, { name, quantity: (prior?.quantity ?? 0) + quantity(amounts[matches[0]].text) })
  }
  return [...products.values()]
}
export function groupProducts(labels: readonly LabelSummary[]): PackingRow[] {
  const rows = new Map<string, PackingRow>()
  for (const label of labels) {
    const seen = new Set<string>()
    for (const item of label.products) {
      const key = item.name.toLowerCase().replace(/ß/g, 'ss').replace(/ς/g, 'σ')
      const row = rows.get(key) ?? { product: item.name, quantity: 0, parcels: 0 }
      row.quantity += item.quantity
      if (!seen.has(key)) { row.parcels++; seen.add(key) }
      rows.set(key, row)
    }
  }
  return [...rows.values()]
}
