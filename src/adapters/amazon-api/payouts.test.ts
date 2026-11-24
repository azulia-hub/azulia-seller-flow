import { expect, it, vi } from 'vitest'
import { amazonPayoutChannels, createPayoutReader } from './payouts'

function transaction(group: string, accountType: string) {
  return { sellingPartnerMetadata: { accountType }, relatedIdentifiers: [
    { relatedIdentifierName: 'FINANCIAL_EVENT_GROUP_ID', relatedIdentifierValue: group },
    { relatedIdentifierName: 'SETTLEMENT_ID', relatedIdentifierValue: 'unrelated' },
  ] }
}

it('uses only consistent account labels on the matching financial event group', () => {
  const cod = 'Cash On Delivery Transactions and Non-Transactional Fees'
  const electronic = 'Electronic Transactions (Credit Card/Net Banking/GC)'
  expect([...amazonPayoutChannels([
    transaction('cod', cod), transaction('electronic', electronic),
    transaction('conflicting', cod), transaction('conflicting', electronic),
    transaction('unknown', 'Other'),
  ])]).toEqual([['cod', 'COD'], ['electronic', 'Electronic']])
})

it('reads bounded Amazon payout pages with exact INR amounts and without bank details', async () => {
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify({ payload: {
      NextToken: 'cursor', FinancialEventGroupList: [{
        FinancialEventGroupId: 'group', FinancialEventGroupStart: '2026-11-20T14:01:25Z',
        ProcessingStatus: 'Open', OriginalTotal: { CurrencyCode: 'INR', CurrencyAmount: -265.58 },
        AccountTail: '0123',
      }],
    } })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ payload: { FinancialEventGroupList: [] } })))
  const result = await createPayoutReader({}, request, 'synthetic-token')(new AbortController().signal)
  expect(result.groups).toEqual([{ id: 'group', startedAt: '2026-11-20T14:01:25Z', transferAt: null,
    amountMinor: -26558, open: true, transferSucceeded: false }])
  expect(String(request.mock.calls[1][0])).toBe('https://sellingpartnerapi-eu.amazon.com/finances/v0/financialEventGroups?NextToken=cursor')
})
