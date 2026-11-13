import { afterEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })
function device(run: (action: string, payload: Record<string, unknown>) => unknown) {
  const port = {
    onmessage: null as ((event: { data: string }) => void) | null,
    postMessage: vi.fn((raw: string) => {
      const request = JSON.parse(raw)
      queueMicrotask(() => {
        try { port.onmessage?.({ data: JSON.stringify({ id: request.id, result: run(request.action, request.payload) }) }) }
        catch { port.onmessage?.({ data: JSON.stringify({ id: request.id, error: 'Native failure', status: 409 }) }) }
      })
    }),
  }
  vi.stubGlobal('window', { AzuliaDevice: port })
  vi.stubGlobal('crypto', webcrypto)
  return port
}
describe('Android transport', () => {
  it('matches replies to concurrent requests and exposes native failures', async () => {
    device((action, payload) => { if (action === 'fail') throw new Error(); return payload })
    const { nativeRequest, androidDevice } = await import('../../src/adapters/device/bridge')
    expect(androidDevice).toBe(true)
    expect(await Promise.all([nativeRequest('first', { n: 1 }), nativeRequest('second', { n: 2 })])).toEqual([{ n: 1 }, { n: 2 }])
    await expect(nativeRequest('fail')).rejects.toMatchObject({ status: 409 })
  })
  it('uses the native session identity but never returns a real access token to JS', async () => {
    const port = device((action, payload) => { expect(action).toBe('session.connect'); expect(payload.account).toMatch(/^[a-f0-9]{64}$/); return { configured: true } })
    const { androidAmazon } = await import('../../src/adapters/device/amazon')
    expect(await androidAmazon({ action: 'connect', clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh' }, new AbortController().signal)).toEqual({ accessToken: 'native-managed' })
    expect(port.postMessage).toHaveBeenCalledTimes(1)
  })
  it('retains exact API money and unknown fields through the existing financial parser', async () => {
    device((action, payload) => {
      expect(action).toBe('amazon.request')
      expect(String(payload.url)).toContain('sellingpartnerapi-eu.amazon.com/finances/')
      return { status: 200, retryAfter: null, body: '{"payload":{"transactions":[{"transactionId":"t","postedDate":"2026-11-01T00:00:00Z","currencyAmount":123456789.91,"futureField":{"currencyAmount":-1.23}}]}}' }
    })
    const { androidAmazon } = await import('../../src/adapters/device/amazon')
    const result = await androidAmazon({ action: 'finance', from: '2026-11-01T00:00:00Z', to: '2026-11-02T00:00:00Z' }, new AbortController().signal)
    expect(result.records).toEqual([{ transactionId: 't', postedDate: '2026-11-01T00:00:00Z', currencyAmount: '123456789.91', futureField: { currencyAmount: '-1.23' } }])
  })
  it('does not send an already cancelled request to Amazon', async () => {
    const port = device(() => { throw new Error('Must not be called') })
    const { androidAmazon } = await import('../../src/adapters/device/amazon')
    const abort = new AbortController(); abort.abort()
    await expect(androidAmazon({ action: 'finance' }, abort.signal)).rejects.toThrow('Stopped')
    expect(port.postMessage).not.toHaveBeenCalled()
  })
  it('parses a saved background page without making another Amazon request', async () => {
    const port = device((action, payload) => {
      expect(action).toBe('background.read'); expect(payload.id).toBe('saved-page')
      return { status: 200, body: '{"payload":{"transactions":[{"transactionId":"t","postedDate":"2026-11-01T00:00:00Z","currencyAmount":12.34}]}}' }
    })
    const { androidAmazon } = await import('../../src/adapters/device/amazon')
    const result = await androidAmazon({ action: 'finance', account: 'a'.repeat(64), backgroundId: 'saved-page', from: '2026-11-01T00:00:00Z', to: '2026-11-02T00:00:00Z' }, new AbortController().signal)
    expect(result.records).toEqual([{ transactionId: 't', postedDate: '2026-11-01T00:00:00Z', currencyAmount: '12.34' }])
    expect(port.postMessage).toHaveBeenCalledTimes(1)
  })
  it('does not publish a new revision just because JSON omitted an optional order field', async () => {
    const account = 'a'.repeat(64), owner = 'writer'
    const order = { id: '123-1234567-1234567', purchased: '2026-11-01T00:00:00.000Z', status: 'Shipped', fulfillmentType: 'AFN', orderValue: '100.00', currency: 'INR', sku: null, asin: null, title: null, imageUrl: null }
    const job = { id: 'job', kind: 'order' as const, scope: 'period', from: order.purchased, to: '2026-11-02T00:00:00Z', orderId: order.id, nextToken: null, createdAt: Date.now() }
    let state: Record<string, unknown>
    device((action, payload) => {
      if (action === 'source.begin') return { version: 3, state, entries: [{ kind: 'orders', id: order.id, value: order }] }
      expect(action).toBe('source.commit')
      expect(payload.version).toBe(3)
      expect(payload.entries).toEqual([])
      expect((payload.state as { revision: number }).revision).toBe(9)
      return { version: 4 }
    })
    const { empty } = await import('../../src/adapters/amazon-hosted/cacheTypes')
    state = { ...empty(account), revision: 9, leaseOwner: owner, leaseUntil: Date.now() + 120000, jobs: [job] }
    const { commitPage } = await import('../../src/adapters/amazon-hosted/cache')
    await commitPage(account, owner, job, { orders: [{ ...order, items: undefined }], nextToken: null })
  })
})

it('reads staged updated-orders pages using the exact updated-time URL, not creation filters', async () => {
  device((action, payload) => {
    expect(action).toBe('background.read')
    const url = new URL(String(payload.url))
    expect(url.searchParams.has('LastUpdatedAfter')).toBe(true)
    expect(url.searchParams.has('CreatedAfter')).toBe(false)
    return { status: 200, body: '{"payload":{"Orders":[{"AmazonOrderId":"123-1234567-1234567","PurchaseDate":"2026-08-01T10:00:00Z","OrderStatus":"Unshipped"}]}}' }
  })
  const { androidAmazon } = await import('../../src/adapters/device/amazon')
  const value = await androidAmazon({ action: 'purchases', account: 'a'.repeat(64), backgroundId: 'saved-page', updatedOnly: true, from: '2026-11-13T00:00:00Z', to: '2026-11-13T02:00:00Z' }, new AbortController().signal)
  expect((value.orders as { purchased: string }[])[0].purchased).toBe('2026-08-01T10:00:00Z')
})
it('does not mark purchase-date history covered after ingesting an updated-orders page', async () => {
  const account = 'a'.repeat(64), owner = 'writer'
  const job = { id: 'background:page', kind: 'purchases' as const, scope: 'background', from: '2026-11-13T00:00:00Z', to: '2026-11-13T02:00:00Z', nextToken: null, updatedOnly: true, createdAt: Date.now() }
  const { empty } = await import('../../src/adapters/amazon-hosted/cacheTypes')
  const state = { ...empty(account), revision: 2, leaseOwner: owner, leaseUntil: Date.now() + 120000, jobs: [job] }
  device((action, payload) => {
    if (action === 'source.begin') return { version: 1, state, entries: [] }
    expect(action).toBe('source.commit')
    expect((payload.state as typeof state).purchaseCoverage).toEqual([])
    expect((payload.state as typeof state).revision).toBe(3)
    return { version: 2 }
  })
  const { commitPage } = await import('../../src/adapters/amazon-hosted/cache')
  await commitPage(account, owner, job, { orders: [{ id: '123-1234567-1234567', purchased: '2026-08-01T10:00:00Z', status: 'Unshipped', fulfillmentType: 'MFN', orderValue: '100.00', currency: 'INR' }], nextToken: null })
})

it('counts source records without loading every financial record through the bridge', async () => {
  const port = device((action, payload) => {
    expect(action).toBe('source.count'); expect(payload.account).toBe('a'.repeat(64)); return { count: 14470 }
  })
  const { recordCount } = await import('../../src/adapters/amazon-hosted/cache')
  expect(await recordCount('a'.repeat(64))).toBe(14470)
  expect(port.postMessage).toHaveBeenCalledTimes(1)
})

it('treats background handoff as automatic continuation, not a request to press Sync', async () => {
  const port = device(() => { throw new Error('No network request is needed for a handoff message') })
  vi.stubGlobal('window', { AzuliaDevice: port, addEventListener: vi.fn() })
  vi.stubGlobal('document', { visibilityState: 'hidden', addEventListener: vi.fn() })
  const { stopHosted, hostedView } = await import('../../src/adapters/amazon-hosted/client')
  stopHosted('background')
  expect(hostedView().progress).toContain('Android continues fetching')
  expect(hostedView().progress).not.toMatch(/Stopping|press Sync/i)
  expect(port.postMessage).not.toHaveBeenCalled()
})
