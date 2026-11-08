/** Exercise the existing local authorization without logging credentials or returned tokens. */
import { loadCredentials } from '../server/local/credentials.ts'
import { getPilotAccessToken } from '../server/amazon/pilot.ts'
if (process.argv.includes('--status')) {
  const response = await fetch('http://127.0.0.1:8788/api/report-sync/status', { signal: AbortSignal.timeout(10000) })
  const status = await response.json()
  console.log(JSON.stringify(Object.fromEntries(['state','records','pendingOrderDates','pendingOrderCycles','catalogPending','catalogError','error','orderDatesError'].map(key => [key, status[key]]))))
  process.exit(0)
}
const credentials = await loadCredentials(new URL('../.local/amazon-credentials.json', import.meta.url).pathname)
let diagnostic: Record<string, unknown> = {}
const request: typeof fetch = async (input, options) => {
  try {
    const response = await fetch(input, options)
    let errorCode: string | undefined
    if (!response.ok) { try { const body = await response.clone().json(); if (['invalid_client','invalid_grant','invalid_request','unauthorized_client','temporarily_unavailable'].includes(body.error)) errorCode = body.error } catch { /* No response details are logged. */ } }
    diagnostic = { httpStatus: response.status, errorCode, authorizationServiceReachable: true }
    return response
  } catch (cause) { diagnostic = { authorizationServiceReachable: false, failure: cause instanceof Error ? cause.name : 'NetworkError' }; throw cause }
}
const token = await getPilotAccessToken(credentials, request)
console.log(JSON.stringify({ ...diagnostic, tokenExchangeAccepted: Boolean(token) }))
