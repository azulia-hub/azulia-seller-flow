import { expect, it, vi } from 'vitest'
import { createOrderDateReader } from '../../server/local/sync/orders'
const credentials = { AMAZON_SP_CLIENT_ID: 'fixture-id', AMAZON_SP_CLIENT_SECRET: 'fixture-secret', AMAZON_SP_REFRESH_TOKEN: 'fixture-refresh' }
const id = '111-1234567-1234567'
const token = () => Response.json({ access_token: 'fixture-access', token_type: 'bearer', expires_in: 3600 })
it('reads minimal purchase-date metadata for the requested order and validates identity', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(token()).mockResolvedValueOnce(Response.json({ payload: { AmazonOrderId: id, PurchaseDate: '2026-10-31T18:00:00Z', MarketplaceId: 'A21TJRUUN4KGV', BuyerInfo: { BuyerEmail: 'fixture@example.invalid' } } }))
  const reader = createOrderDateReader(credentials, request)
  expect(await reader.one(id, new AbortController().signal)).toEqual({ id, purchased: '2026-10-31T18:00:00Z' })
  expect(String(request.mock.calls[1][0])).toBe(`https://sellingpartnerapi-eu.amazon.com/orders/v0/orders/${id}`)
  request.mockResolvedValueOnce(Response.json({ payload: { AmazonOrderId: '222-1234567-1234567', PurchaseDate: '2026-10-31T18:00:00Z' } }))
  await expect(reader.one(id, new AbortController().signal)).rejects.toThrow('different order identity')
})
it('discovers orders by purchase window without retaining buyer data and surfaces denied access', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(token()).mockResolvedValueOnce(Response.json({ payload: { Orders: [{ AmazonOrderId: id, PurchaseDate: '2026-10-20T00:00:00Z' }], NextToken: 'next' } })).mockResolvedValueOnce(new Response(null, { status: 403 }))
  const reader = createOrderDateReader(credentials, request)
  const job = { id: 1, kind: 'purchases', from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00Z', orderId: null, nextToken: null, createdAt: 0 }
  expect(await reader.page(job, new AbortController().signal)).toEqual({ orders: [{ id, purchased: '2026-10-20T00:00:00Z' }], issues: [], nextToken: 'next' })
  const url = new URL(String(request.mock.calls[1][0]))
  expect(url.searchParams.get('CreatedAfter')).toBe(job.from)
  expect(url.searchParams.has('LastUpdatedAfter')).toBe(false)
  await expect(reader.one(id, new AbortController().signal)).rejects.toThrow('denied order access')
})
it('preserves unsupported order-date evidence and continues pagination for valid orders', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(token()).mockResolvedValueOnce(Response.json({ payload: { Orders: [{ AmazonOrderId: id, PurchaseDate: '2026-10-20T00:00:00Z' }, { AmazonOrderId: 'unsupported-reference', PurchaseDate: null, BuyerInfo: { BuyerEmail: 'must-not-persist@example.invalid' } }], NextToken: 'next' } }))
  const reader = createOrderDateReader(credentials, request)
  const page = await reader.page({ id: 1, kind: 'purchases', from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00Z', nextToken: null, orderId: null, createdAt: 0 }, new AbortController().signal)
  expect(page.orders).toEqual([{ id, purchased: '2026-10-20T00:00:00Z' }])
  expect(page.nextToken).toBe('next')
  expect(page.issues).toHaveLength(1)
  expect(JSON.parse(page.issues[0].raw)).toEqual({ AmazonOrderId: 'unsupported-reference', PurchaseDate: null })
  expect(page.issues[0].raw).not.toContain('must-not-persist')
})
it('accepts the alphanumeric S-prefix order IDs returned in real Orders pages', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(token()).mockResolvedValueOnce(Response.json({ payload: { Orders: [{ AmazonOrderId: 'S01-1234567-1234567', PurchaseDate: '2026-10-20T00:00:00Z' }] } }))
  const page = await createOrderDateReader(credentials, request).page({ id: 1, kind: 'purchases', from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00Z', nextToken: null, orderId: null, createdAt: 0 }, new AbortController().signal)
  expect(page.orders).toEqual([{ id: 'S01-1234567-1234567', purchased: '2026-10-20T00:00:00Z' }])
  expect(page.issues).toEqual([])
})

it('retains only order identity, status and value, excluding buyer and address information', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(token()).mockResolvedValueOnce(Response.json({ payload: { AmazonOrderId: id, PurchaseDate: '2026-11-01T00:00:00Z', OrderStatus: 'Unshipped', FulfillmentChannel: 'MFN', OrderTotal: { Amount: '1180.00', CurrencyCode: 'INR' }, BuyerInfo: { BuyerEmail: 'private@example.invalid' }, ShippingAddress: { Name: 'private' } } }))
  const order = await createOrderDateReader(credentials, request).one(id, new AbortController().signal)
  expect(order.summary).toEqual({ id, purchased: '2026-11-01T00:00:00Z', status: 'Unshipped', fulfillmentType: 'MFN', orderValue: '1180.00', currency: 'INR' })
  expect(JSON.stringify(order)).not.toContain('private')
})
