import { expect, test } from '@playwright/test'

for (const width of [390, 1280]) test(`weekly payout card joins Amazon channels at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.clock.setFixedTime(new Date('2026-11-24T10:00:00Z'))
  const account = 'synthetic'
  const observedAt = '2026-11-24T09:30:00Z'
  await page.route('**/api/report-sync/status', route => route.fulfill({ json: {
    configured: true, connectionKey: account, revision: 1, records: 3, missingWindows: 0,
    coverage: [], state: 'idle', lastSync: observedAt, nextAttempt: null, error: null,
  } }))
  await page.route('**/api/report-sync/data?*', route => route.fulfill({ json: {
    connectionKey: account, revision: 1, updatedAt: observedAt, coverage: [], records: [...[
      ['cod', 'Cash On Delivery Transactions and Non-Transactional Fees'],
      ['electronic', 'Electronic Transactions (Credit Card/Net Banking/GC)'],
    ].map(([id, accountType]) => ({
      transactionId: id, transactionStatus: 'RELEASED', transactionType: 'Transfer', postedDate: observedAt,
      totalAmount: { currencyCode: 'INR', currencyAmount: '1000.00' },
      sellingPartnerMetadata: { accountType },
      relatedIdentifiers: [{ relatedIdentifierName: 'FINANCIAL_EVENT_GROUP_ID', relatedIdentifierValue: id }],
    })), {
      transactionId: 'reserve', transactionStatus: 'RELEASED', transactionType: 'Adjustment',
      description: 'Reserve release', postedDate: '2026-11-16T09:00:00Z',
      totalAmount: { currencyCode: 'INR', currencyAmount: '500.00' },
      relatedIdentifiers: [{ relatedIdentifierName: 'FINANCIAL_EVENT_GROUP_ID', relatedIdentifierValue: 'previous' }],
    }],
  } }))
  await page.route('**/api/report-sync/payouts?*', route => route.fulfill({ json: {
    observedAt, groups: [
      { id: 'cod', startedAt: '2026-11-20T14:01:25Z', transferAt: null, open: true, transferSucceeded: false, amountMinor: -26558 },
      { id: 'electronic', startedAt: '2026-11-21T07:34:09Z', transferAt: null, open: true, transferSucceeded: false, amountMinor: 125000 },
      { id: 'previous', startedAt: '2026-11-10T07:00:00Z', transferAt: '2026-11-17T07:00:00Z', open: false,
        transferSucceeded: true, amountMinor: 60000, openingMinor: 10000, traceReference: 'TRANSFER-123' },
    ],
  } }))
  await page.goto('/')
  const card = page.getByRole('region', { name: 'This week’s payout' })
  await expect(card.getByText('Fri, 27 Nov · Open balance')).toBeVisible()
  await expect(card.getByText('Sat, 28 Nov · Open balance')).toBeVisible()
  await expect(card.getByText(/265/)).toBeVisible()
  await expect(card.getByText(/1,250/)).toHaveCount(2)
  await expect(card.getByText('Total expected deposit')).toBeVisible()
  await card.getByRole('button', { name: 'Previous week' }).click()
  const history = page.getByRole('region', { name: 'Payout history' })
  await history.getByRole('button', { name: 'View payout details' }).click()
  const details = history.getByRole('region', { name: 'Payout details' })
  await expect(details.getByText('Transfer reference TRANSFER-123')).toBeVisible()
  await expect(details.getByText(/Awaiting bank match/)).toBeVisible()
  await details.getByText('Linked activity breakdown (1 transaction)').click()
  await details.getByText('Reserves · ₹500.00').click()
  await expect(details.getByText(/Reserve release.*500/)).toBeVisible()
  await details.getByLabel('Bank credit (₹)').fill('599')
  await details.getByLabel('Credit date').fill('2026-11-18')
  await details.getByRole('button', { name: 'Save bank credit' }).click()
  await expect(details.getByText(/Bank amount differs/)).toBeVisible()
  await details.getByLabel('Bank credit (₹)').fill('600')
  await details.getByRole('button', { name: 'Save bank credit' }).click()
  await expect(details.getByText(/Bank credit matched manually/)).toBeVisible()
  await history.getByRole('button', { name: 'Next week' }).click()
  await card.getByRole('button', { name: 'Previous week' }).click()
  await history.getByRole('button', { name: 'View payout details' }).click()
  await expect(details.getByText(/Bank credit matched manually/)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
