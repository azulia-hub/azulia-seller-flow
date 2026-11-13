import { describe, it, expect } from 'vitest'
import { encodeReading, decodeReading } from './readingCodec'
describe('lossless reading codec', () => {
  it('round trips exact money, unknown fields and Unicode across compressed chunks', async () => {
    const value = { revision: 42, sourceRecords: [{ amount: '123456789012345.91', unknown: Array.from({ length: 30000 }, (_, i) => `${i * i}:₹🪑हिन्दी`).join('|') }], orders: [] }
    expect(await decodeReading(await encodeReading(value))).toEqual(value)
  })
  it('reads legacy plain readings', async () => { expect(await decodeReading('{"amount":"-0.01"}')).toEqual({ amount: '-0.01' }) })
  it('rejects corrupt storage rather than substituting an empty reading', async () => { await expect(decodeReading('{"__azuliaGzipReading":1,"base64":"bad!"}')).rejects.toThrow() })
})
