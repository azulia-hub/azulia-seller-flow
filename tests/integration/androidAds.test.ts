import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })
function device(run: (action: string, payload: Record<string, unknown>) => unknown) {
  const port = { onmessage: null as ((event: { data: string }) => void) | null, postMessage: vi.fn((raw: string) => {
    const request = JSON.parse(raw)
    queueMicrotask(() => {
      try { port.onmessage?.({ data: JSON.stringify({ id: request.id, result: run(request.action, request.payload) }) }) }
      catch { port.onmessage?.({ data: JSON.stringify({ id: request.id, error: 'Native failure', status: 409 }) }) }
    })
  }) }
  vi.stubGlobal('window', { AzuliaDevice: port, addEventListener: vi.fn() })
  return port
}
const raw = (date: string, cost: number | null) => ({ date, advertisedSku: 'SKU', advertisedAsin: 'B012345678', impressions: 20, clicks: 3, cost, sales7d: 100, attributedSalesSameSku7d: 90, salesOtherSku7d: 10, purchases7d: 1, unitsSoldClicks7d: 1, unknown: '₹ preserved' })

describe('Android Ads source transport', () => {
  it('routes read-only configuration through the profile-bound native action', async () => {
    device((action, payload) => {
      expect(action).toBe('ads.entities')
      expect(payload).toMatchObject({ entity: 'campaigns', profileId: '123' })
      return { campaigns: [{ campaignId: 'c', state: 'PAUSED' }] }
    })
    const { nativeAdsFetch } = await import('../../src/adapters/amazon-ads/native')
    const result = await (await nativeAdsFetch('/api/ads/entities?profile=123&kind=campaigns')).json()
    expect(result).toMatchObject({ profileId: '123', rows: [{ campaignId: 'c', state: 'PAUSED' }] })
    await expect(nativeAdsFetch('/api/ads/entities?profile=123&kind=delete')).rejects.toThrow('Unsupported')
  })
  it('isolates supplemental caches and raw chunks from the advertised-product source', async () => {
    const content = JSON.stringify([{ ...raw('2026-11-01', 7), campaignId: 'c', adGroupId: 'g', searchTerm: 'wooden table' }])
    const port = device((action, payload) => {
      expect(payload.kind).toBe('searchTerm')
      expect(payload.profileId).toBe('123')
      if (action === 'ads.index') return { configured: true, identity: 'term-identity', profileId: '123', revision: 1, from: '2026-11-01', to: '2026-11-01', sources: [{ id: 'terms', from: '2026-11-01', to: '2026-11-01', days: ['2026-11-01'], bytes: Buffer.byteLength(content) }] }
      expect(action).toBe('ads.chunk')
      return { data: Buffer.from(content).toString('base64'), next: Buffer.byteLength(content), done: true }
    })
    const { nativeAdsFetch } = await import('../../src/adapters/amazon-ads/native')
    const result = await (await nativeAdsFetch('/api/ads/dataset?kind=searchTerm&profile=123')).json()
    expect(result.kind).toBe('searchTerm')
    expect(result.report.kind).toBe('searchTerm')
    expect(result.report.rows[0].searchTerm).toBe('wooden table')
    const count = port.postMessage.mock.calls.length
    await nativeAdsFetch('/api/ads/dataset?kind=searchTerm&profile=123')
    expect(port.postMessage.mock.calls.length - count).toBe(1)
    await expect(nativeAdsFetch('/api/ads/dataset?kind=untrusted&profile=123')).rejects.toThrow('Unsupported')
  })
  it('uses only the latest source owner for each day without duplicating overlapping spend', async () => {
    const files = { first: JSON.stringify([raw('2026-11-01', 1), raw('2026-11-02', 99)]), second: JSON.stringify([raw('2026-11-02', 2)]) }
    const port = device((action, payload) => {
      expect(payload.profileId).toBe('123')
      if (action === 'ads.index') return { configured: true, identity: 'native-identity', profileId: '123', revision: 2, from: '2026-11-01', to: '2026-11-02', sources: [
        { id: 'first', from: '2026-11-01', to: '2026-11-02', days: ['2026-11-01'], bytes: Buffer.byteLength(files.first) },
        { id: 'second', from: '2026-11-02', to: '2026-11-02', days: ['2026-11-02'], bytes: Buffer.byteLength(files.second) },
      ] }
      expect(action).toBe('ads.chunk')
      const content = files[payload.id as keyof typeof files]
      return { data: Buffer.from(content).toString('base64'), next: Buffer.byteLength(content), done: true }
    })
    const { nativeAdsFetch } = await import('../../src/adapters/amazon-ads/native')
    const result = await (await nativeAdsFetch('/api/ads/report?profile=123')).json()
    expect(result.report.rows.map((row: { spendExcludingTax: number }) => row.spendExcludingTax)).toEqual([1, 2])
    expect(result.report.rows[0].raw.unknown).toBe('₹ preserved')
    const count = port.postMessage.mock.calls.length
    await nativeAdsFetch('/api/ads/report?profile=123')
    expect(port.postMessage.mock.calls.length - count).toBe(1) // Lightweight index only for an unchanged revision.
  })
  it('validates the full pending observation before accepting date coverage', async () => {
    const content = JSON.stringify([raw('2026-11-01', 10)]), calls: string[] = []
    device(action => {
      calls.push(action)
      if (action === 'ads.cycle') return { configured: true, profileId: '123', revision: 0, download: { id: 'pending', from: '2026-11-01', to: '2026-11-01', bytes: Buffer.byteLength(content) } }
      if (action === 'ads.chunk') return { data: Buffer.from(content).toString('base64'), next: Buffer.byteLength(content), done: true }
      return { configured: true, revision: 1 }
    })
    const { syncAndroidAds } = await import('../../src/adapters/amazon-ads/native')
    await Promise.all([syncAndroidAds(), syncAndroidAds()])
    expect(calls).toEqual(['ads.cycle', 'ads.chunk', 'ads.accept'])
  })
  it('rejects malformed observations without accepting false coverage or exposing credentials', async () => {
    const content = JSON.stringify([raw('2026-11-01', null)]), calls: string[] = []
    const port = device(action => {
      calls.push(action)
      if (action === 'ads.cycle') return { configured: true, profileId: '123', revision: 0, download: { id: 'pending', from: '2026-11-01', to: '2026-11-01', bytes: Buffer.byteLength(content) } }
      if (action === 'ads.chunk') return { data: Buffer.from(content).toString('base64'), next: Buffer.byteLength(content), done: true }
      return {}
    })
    const { syncAndroidAds } = await import('../../src/adapters/amazon-ads/native')
    await syncAndroidAds()
    expect(calls).toEqual(['ads.cycle', 'ads.chunk', 'ads.reject'])
    expect(JSON.stringify(port.postMessage.mock.calls)).not.toMatch(/clientSecret|access_token|refreshToken/)
  })
})
