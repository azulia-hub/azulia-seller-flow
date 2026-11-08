import { describe, expect, it, vi } from 'vitest'
import { checkPilotPermissions } from '../../server/amazon/permissions'

const credentials = { AMAZON_SP_CLIENT_ID: 'private-client', AMAZON_SP_CLIENT_SECRET: 'private-secret', AMAZON_SP_REFRESH_TOKEN: 'private-refresh' }
const now = new Date('2026-11-06T12:00:00Z')
function fixture(orders = 200, finances = 200, token = 200) {
  const cancel = vi.fn()
  const request = vi.fn<typeof fetch>(async (url, options) => {
    if (String(url) === 'https://api.amazon.com/auth/o2/token') return Response.json({ access_token: 'private-access', token_type: 'bearer', expires_in: 3600 }, { status: token })
    expect(options?.method).toBe('GET')
    expect(options?.redirect).toBe('error')
    expect(new Headers(options?.headers).get('x-amz-access-token')).toBe('private-access')
    const response = new Response(new ReadableStream({ cancel }), { status: String(url).includes('/orders/') ? orders : finances })
    return response
  })
  return { request, cancel }
}
describe('Amazon operation permission probes', () => {
  it('checks only fixed India read endpoints, discards bodies and returns no tokens', async () => {
    const { request, cancel } = fixture()
    const result = await checkPilotPermissions(credentials, request, now)
    expect(result.orders).toEqual({ status: 'verified', httpStatus: 200 })
    expect(result.finances).toEqual({ status: 'verified', httpStatus: 200 })
    expect(request).toHaveBeenCalledTimes(3)
    expect(cancel).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(result)).not.toContain('private-')
    const orders = new URL(String(request.mock.calls[1][0]))
    expect(orders.origin).toBe('https://sellingpartnerapi-eu.amazon.com')
    expect(orders.searchParams.get('maxResultsPerPage')).toBe('1')
    expect(orders.searchParams.get('marketplaceIds')).toBe('A21TJRUUN4KGV')
    expect(orders.searchParams.has('includedData')).toBe(false)
    expect(orders.searchParams.get('createdBefore')).toBe('2026-11-04T11:00:00.000Z')
    const finance = new URL(String(request.mock.calls[2][0]))
    expect(finance.searchParams.get('postedAfter')).toBe('2026-11-04T10:00:00.000Z')
    expect(finance.searchParams.has('nextToken')).toBe(false)
    expect(result.scope).toBe('one_read_per_operation')
  })
  it('distinguishes permission denial from throttling without claiming verification', async () => {
    const { request } = fixture(403, 429)
    const result = await checkPilotPermissions(credentials, request, now)
    expect(result.orders.status).toBe('denied')
    expect(result.finances.status).toBe('throttled')
  })
  it('stops before business APIs if token exchange fails', async () => {
    const { request } = fixture(200, 200, 400)
    const result = await checkPilotPermissions(credentials, request, now)
    expect(result.tokenExchangeVerified).toBe(false)
    expect(result.orders.status).toBe('not_checked')
    expect(result.finances.status).toBe('not_checked')
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('sanitizes network errors', async () => {
    const { request } = fixture()
    request.mockImplementationOnce(async () => Response.json({ access_token: 'private-access', token_type: 'bearer', expires_in: 3600 }))
      .mockImplementationOnce(async () => { throw new Error('private-access') })
    const result = await checkPilotPermissions(credentials, request, now)
    expect(result.orders).toEqual({ status: 'unavailable', httpStatus: null })
    expect(result.finances.status).toBe('verified')
    expect(JSON.stringify(result)).not.toContain('private-access')
  })
})
