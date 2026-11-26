import type { CanonicalFinancialEvent } from '../../core/data/types.ts'
import type { SettlementActivity, SettlementCategory, SettlementComponent } from '../../core/cashflow/payoutReconciliation.ts'
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
  const amountMinor = inrMinor(row.OriginalTotal)
  return { id, startedAt, transferAt, amountMinor,
    ...(row.BeginningBalance === undefined ? {} : { openingMinor: inrMinor(row.BeginningBalance) }),
    ...(row.ConvertedTotal === undefined ? {} : { bankTransferMinor: inrMinor(row.ConvertedTotal) }),
    ...(typeof row.TraceId === 'string' && row.TraceId ? { traceReference: row.TraceId } : {}),
    open: row.ProcessingStatus === 'Open',
    transferSucceeded: row.ProcessingStatus === 'Closed' && row.FundTransferStatus === 'Succeeded' }
}

function inrMinor(value: unknown, native = false) {
  const amount = object(value)
  const raw = native ? amount.currencyAmount : amount.CurrencyAmount
  const currency = native ? amount.currencyCode : amount.CurrencyCode
  const minor = currency === 'INR' ? cents(typeof raw === 'number' ? String(raw) : raw) : null
  return minor === null || !Number.isSafeInteger(Number(minor)) ? null : Number(minor)
}

function payoutComponentCategory(event: CanonicalFinancialEvent, label: string): SettlementCategory {
  if (/reserve/i.test(label)) return 'Reserves'
  if (event.event === 'REIMBURSEMENT') return 'Reimbursements'
  if (event.amountType === 'TAX' || event.event === 'TAX') return 'Taxes'
  if (event.amountType === 'COMMISSION' || event.amountType.endsWith('_FEE') || event.event === 'FEE') return 'Fees'
  if (['PRODUCT_REVENUE', 'SHIPPING_REVENUE', 'GIFT_WRAP_REVENUE', 'PROMOTION'].includes(event.amountType)) {
    if (event.event === 'SALE') return 'Sales'
    if (event.event === 'REFUND') return 'Refunds'
  }
  return 'Adjustments and unclassified'
}

export function amazonSettlementActivity(records: readonly Record<string, unknown>[], groupId: string, events: readonly CanonicalFinancialEvent[] = []) {
  const rows = new Map<string, SettlementActivity>()
  const componentsByTransaction = new Map<string, SettlementComponent[]>()
  for (const record of records) {
    if (text(record.transactionStatus).toUpperCase() !== 'RELEASED') continue
    const type = text(record.transactionType)
    const kind = type.replace(/[^a-z]/gi, '').toLowerCase()
    if (['transfer', 'fundtransfer', 'disbursement', 'settlement', 'payout'].includes(kind)) continue
    if (!Array.isArray(record.relatedIdentifiers)) continue
    const ids = new Set(record.relatedIdentifiers.map(object)
      .filter(item => item.relatedIdentifierName === 'FINANCIAL_EVENT_GROUP_ID')
      .map(item => text(item.relatedIdentifierValue)).filter(Boolean))
    if (!ids.has(groupId)) continue
    const id = text(record.transactionId)
    const key = id || `unknown-${rows.size}`
    const label = [type, text(record.description)].filter(Boolean).join(' · ') || 'Unclassified transaction'
    rows.set(key, { id: key, label, category: /reserve/i.test(label) ? 'Reserves' : undefined,
      postedAt: text(record.postedDate), amountMinor: id && ids.size === 1 ? inrMinor(record.totalAmount, true) : null })
  }
  for (const event of events) {
    const id = event.sourceTransactionId
    const row = id ? rows.get(id) : undefined
    if (!id || !row) continue
    const label = text(event.raw?.['api component']) || event.rawDescription || event.rawType || event.amountType
    const components = componentsByTransaction.get(id) ?? []
    components.push({ label, category: row.category ?? payoutComponentCategory(event, label), amountMinor: Math.round(event.amount * 100) })
    componentsByTransaction.set(id, components)
  }
  return [...rows.values()].map(row => {
    const components = componentsByTransaction.get(row.id)
    return components ? { ...row, components } : row
  }).sort((a, b) => b.postedAt.localeCompare(a.postedAt) || a.id.localeCompare(b.id))
}

export function createPayoutReader(credentials: PilotCredentials, request: typeof fetch = fetch, sessionToken?: string) {
  return async (signal: AbortSignal): Promise<PayoutSnapshot> => {
    const token = sessionToken ?? await sourceAccessToken(credentials, request)
    const now = Date.now(), groups: PayoutGroup[] = [], seen = new Set<string>()
    let next = ''
    for (let page = 0; page < 3; page++) {
      const url = new URL('https://sellingpartnerapi-eu.amazon.com/finances/v0/financialEventGroups')
      url.search = new URLSearchParams(next ? { NextToken: next } : {
        FinancialEventGroupStartedAfter: new Date(now - 42 * 86400000).toISOString(), MaxResultsPerPage: '100',
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
