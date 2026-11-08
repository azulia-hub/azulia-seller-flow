import { getPilotAccessToken, type PilotCredentials } from './pilot.ts'

export interface OperationCheck {
  status: 'verified' | 'denied' | 'throttled' | 'unavailable' | 'not_checked'
  httpStatus: number | null
}
export interface PermissionResult {
  tokenExchangeVerified: boolean
  orders: OperationCheck
  finances: OperationCheck
  marketplace: 'A21TJRUUN4KGV'
  checkedAt: string
  scope: 'one_read_per_operation'
}

/** One read per operation, no pagination, payload storage or permission claims beyond these operations. */
export async function checkPilotPermissions(credentials: PilotCredentials, request: typeof fetch = fetch, now = new Date()): Promise<PermissionResult> {
  const unchecked: OperationCheck = { status: 'not_checked', httpStatus: null }
  const result: PermissionResult = { tokenExchangeVerified: false, orders: { ...unchecked }, finances: { ...unchecked }, marketplace: 'A21TJRUUN4KGV', checkedAt: now.toISOString(), scope: 'one_read_per_operation' }
  const accessToken = await getPilotAccessToken(credentials, request)
  if (!accessToken) return result
  result.tokenExchangeVerified = true
  // Avoid the most recent 48h finance lag and all two-minute freshness boundaries.
  const end = new Date(now.getTime() - 49 * 3600000).toISOString()
  const start = new Date(now.getTime() - 50 * 3600000).toISOString()
  const orders = new URL('https://sellingpartnerapi-eu.amazon.com/orders/2026-01-01/orders')
  orders.search = new URLSearchParams({ marketplaceIds: result.marketplace, createdAfter: start, createdBefore: end, maxResultsPerPage: '1' }).toString()
  const finances = new URL('https://sellingpartnerapi-eu.amazon.com/finances/2024-06-19/transactions')
  finances.search = new URLSearchParams({ marketplaceId: result.marketplace, postedAfter: start, postedBefore: end }).toString()
  async function probe(url: URL): Promise<OperationCheck> {
    try {
      const response = await request(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'x-amz-access-token': accessToken! } })
      // Discard success and failure payloads alike: never persist/print order or financial data.
      await response.body?.cancel()
      const status = response.status === 200 ? 'verified' : [401, 403].includes(response.status) ? 'denied' : response.status === 429 ? 'throttled' : 'unavailable'
      return { status, httpStatus: response.status }
    } catch { return { status: 'unavailable', httpStatus: null } }
  }
  result.orders = await probe(orders)
  result.finances = await probe(finances)
  return result
}
