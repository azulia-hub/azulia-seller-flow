import type { PayoutGroup, PayoutSnapshot } from '../../core/cashflow/weeklyPayout.ts'
import { cents, object, parseSourceJson, text } from '../amazon-report-sync/money.ts'
import type { PilotCredentials } from './authorization.ts'
import { SourceError, sourceAccessToken } from './reader.ts'

export const payoutChannels = ['COD', 'Electronic'] as const

export function amazonPayoutChannels(records: readonly Record<string, unknown>[]) {
  const labels = new Map<string, Set<string>>()
  for (const record of records) {
    const account = text(object(record.sellingPartnerMetadata).accountType).toLowerCase()
    const channel = account.startsWith('cash on delivery transactions') ? 'COD' :
      account.startsWith('electronic transactions') ? 'Electronic' : null
    if (!channel || !Array.isArray(record.relatedIdentifiers)) continue
    for (const value of record.relatedIdentifiers) {
      const identifier = object(value), id = text(identifier.relatedIdentifierValue)
      if (identifier.relatedIdentifierName !== 'FINANCIAL_EVENT_GROUP_ID' || !id) continue
      const seen = labels.get(id) ?? new Set<string>()
      seen.add(channel)
      labels.set(id, seen)
    }
  }
  return new Map([...labels].filter(([, seen]) => seen.size === 1).map(([id, seen]) => [id, [...seen][0]]))
}

function parseGroup(value: unknown): PayoutGroup {
  const row = object(value), id = text(row.FinancialEventGroupId)
  const startedAt = text(row.FinancialEventGroupStart), transferAt = text(row.FundTransferDate) || null
  if (!id || id.length > 256 || !Number.isFinite(Date.parse(startedAt)) ||
      (transferAt && !Number.isFinite(Date.parse(transferAt))) ||
      !['Open', 'Closed'].includes(text(row.ProcessingStatus))) {
    throw new SourceError('Amazon returned an unsupported payout record.')
  }
  const amount = object(row.OriginalTotal)
  const minor = amount.CurrencyCode === 'INR' ? cents(amount.CurrencyAmount) : null
  const amountMinor = minor === null || !Number.isSafeInteger(Number(minor)) ? null : Number(minor)
  return { id, startedAt, transferAt, amountMinor, open: row.ProcessingStatus === 'Open',
    transferSucceeded: row.ProcessingStatus === 'Closed' && row.FundTransferStatus === 'Succeeded' }
}

export function createPayoutReader(credentials: PilotCredentials, request: typeof fetch = fetch, sessionToken?: string) {
  return async (signal: AbortSignal): Promise<PayoutSnapshot> => {
    const token = sessionToken ?? await sourceAccessToken(credentials, request)
    const now = Date.now(), groups: PayoutGroup[] = [], seen = new Set<string>()
    let next = ''
    for (let page = 0; page < 3; page++) {
      const url = new URL('https://sellingpartnerapi-eu.amazon.com/finances/v0/financialEventGroups')
      url.search = new URLSearchParams(next ? { NextToken: next } : {
        FinancialEventGroupStartedAfter: new Date(now - 28 * 86400000).toISOString(), MaxResultsPerPage: '100',
      }).toString()
      const response = await request(url, { redirect: 'error', signal, headers: { 'x-amz-access-token': token } })
      if (!response.ok) {
        await response.body?.cancel()
        throw new SourceError('Amazon payout data could not be refreshed.', Number(response.headers.get('retry-after')) || 60, response.status)
      }
      const payload = object(object(parseSourceJson(await response.text())).payload)
      if (!Array.isArray(payload.FinancialEventGroupList) || payload.FinancialEventGroupList.length > 100) {
        throw new SourceError('Amazon returned an unsupported payout list.')
      }
      groups.push(...payload.FinancialEventGroupList.map(parseGroup))
      next = text(payload.NextToken)
      if (!next) return { groups, observedAt: new Date(now).toISOString() }
      if (next.length > 8192 || seen.has(next)) throw new SourceError('Amazon returned an invalid payout continuation.')
      seen.add(next)
    }
    throw new SourceError('Amazon payout history exceeded the supported page limit.')
  }
}
