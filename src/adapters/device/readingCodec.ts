/** Lossless storage encoding. Runs in a worker; no financial transformation. */
export async function encodeReading(value: unknown): Promise<string> {
  const raw = JSON.stringify(value)
  if (typeof CompressionStream === 'undefined') return raw
  const bytes = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())
  const parts: string[] = []
  for (let offset = 0; offset < bytes.length; offset += 32768) parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)))
  return JSON.stringify({ __azuliaGzipReading: 1, base64: btoa(parts.join('')) })
}
export async function decodeReading(raw: string): Promise<unknown> {
  const value = JSON.parse(raw)
  if (value?.__azuliaGzipReading !== 1 || typeof value.base64 !== 'string') return value
  const bytes = Uint8Array.from(atob(value.base64), char => char.charCodeAt(0))
  return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text())
}
