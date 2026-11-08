/** Preserve money tokens before JSON's binary floating-point conversion. Other values remain unchanged. */
export function parseSourceJson(raw: string): unknown {
  const strings = /"(?:[^"\\]|\\[\s\S])*"/g, parts: string[] = []
  let last = 0, match: RegExpExecArray | null
  while ((match = strings.exec(raw))) {
    const key: unknown = JSON.parse(match[0])
    if (key !== 'currencyAmount' && key !== 'CurrencyAmount') continue
    let cursor = match.index + match[0].length
    while (/\s/.test(raw[cursor] ?? '') && cursor < raw.length) cursor++
    if (raw[cursor++] !== ':') continue
    while (/\s/.test(raw[cursor] ?? '') && cursor < raw.length) cursor++
    const number = raw.slice(cursor).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)
    if (!number) continue
    parts.push(raw.slice(last, cursor), JSON.stringify(number[0])); last = cursor + number[0].length; strings.lastIndex = last
  }
  parts.push(raw.slice(last)); return JSON.parse(parts.join(''))
}
export function cents(value: unknown): bigint | null {
  if (typeof value !== 'string' || value.length > 70 || !/^-?\d+(?:\.\d{1,2})?$/.test(value)) return null
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.')
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) * (value.startsWith('-') ? -1n : 1n)
}
export function decimal(value: bigint) { const amount = value < 0n ? -value : value; return `${value < 0n ? '-' : ''}${amount / 100n}.${String(amount % 100n).padStart(2, '0')}` }
export const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
export const text = (value: unknown) => typeof value === 'string' ? value : ''
