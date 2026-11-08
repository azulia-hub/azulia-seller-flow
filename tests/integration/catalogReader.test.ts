import { expect, it, vi } from 'vitest'
import { createCatalogReader } from '../../server/local/sync/catalog'
import { requirePilotAccessToken } from '../../server/amazon/pilot'
const credentials = { AMAZON_SP_CLIENT_ID: 'fixture', AMAZON_SP_CLIENT_SECRET: 'fixture', AMAZON_SP_REFRESH_TOKEN: 'fixture' }
it('distinguishes unreachable authorization service from rejected credentials without exposing provider details', async () => {
  const network = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('network error'))
  await expect(requirePilotAccessToken(credentials, network)).rejects.toMatchObject({ status: 0, retryAfter: 60, message: expect.stringContaining('Cannot reach Amazon') })
  const rejected = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: 'invalid_grant', error_description: 'do-not-display' }, { status: 400 }))
  await expect(requirePilotAccessToken(credentials, rejected)).rejects.toMatchObject({ status: 401, message: expect.stringContaining('Amazon rejected') })
})
it('loads an actual main catalog image and title for the exact requested India ASIN', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ access_token: 'fixture-token', token_type: 'bearer', expires_in: 3600 })).mockResolvedValueOnce(Response.json({ asin: 'B012345678', summaries: [{ marketplaceId: 'A21TJRUUN4KGV', itemName: 'Oak shelf' }], images: [{ marketplaceId: 'A21TJRUUN4KGV', images: [{ variant: 'MAIN', width: 500, link: 'https://images.example.invalid/product.jpg' }] }] }))
  expect(await createCatalogReader(credentials, request)('B012345678', new AbortController().signal)).toEqual({ asin: 'B012345678', title: 'Oak shelf', imageUrl: 'https://images.example.invalid/product.jpg' })
  const url = new URL(String(request.mock.calls[1][0])); expect(url.searchParams.get('includedData')).toBe('images,summaries')
})
it('keeps financial access independent of missing catalog permission', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ access_token: 'fixture-token', token_type: 'bearer', expires_in: 3600 })).mockResolvedValueOnce(new Response(null, { status: 403 }))
  await expect(createCatalogReader(credentials, request)('B012345678', new AbortController().signal)).rejects.toMatchObject({ status: 403, message: expect.stringContaining('financial data remain available') })
})
