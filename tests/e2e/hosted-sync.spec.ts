import { expect, test } from '@playwright/test'

// Authored only: no browser verification is authorized until the owner requests it.
for (const width of [1280, 390]) test(`hosted sync remains on-demand, caches records and forgets credentials at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  let requests = 0
  const money = (amount: string) => ({ currencyCode: 'INR', currencyAmount: amount })
  await page.route('**/.netlify/functions/amazon', route => {
    requests++
    const body = route.request().postDataJSON()
    if (body.action === 'connect') return route.fulfill({ json: { accessToken: 'fixture-access', expiresIn: 2700 } })
    if (body.action === 'purchases') return route.fulfill({ json: { orders: [{ id: '111-1234567-1234567', purchased: '2026-01-01T00:00:00Z', summary: { status: 'Shipped', fulfillmentType: 'MFN', orderValue: '118.00', currency: 'INR' } }], issues: [], nextToken: null } })
    if (body.action === 'finance') return route.fulfill({ json: { records: [{ transactionId: 'fixture-tx', postedDate: '2026-01-01T10:00:00Z', transactionStatus: 'DEFERRED', transactionType: 'Shipment', totalAmount: money('100.00'), relatedIdentifiers: [{ relatedIdentifierName: 'ORDER_ID', relatedIdentifierValue: '111-1234567-1234567' }], items: [{ totalAmount: money('100.00'), description: 'Fixture shelf', contexts: [{ contextType: 'ProductContext', sku: 'SKU', quantityShipped: 1, fulfillmentNetwork: 'MFN' }], breakdowns: [{ breakdownType: 'ProductCharges', breakdownAmount: money('100.00') }] }] }], nextToken: null } })
    return route.fulfill({ status: 400, json: { error: 'Unexpected fixture operation.' } })
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeDisabled()
  expect(requests).toBe(0)
  await page.getByRole('button', { name: 'Enter credentials' }).click()
  await page.getByLabel('LWA client ID', { exact: true }).fill('fixture-client')
  await page.getByLabel('LWA client secret', { exact: true }).fill('fixture-secret')
  await page.getByLabel('SP-API refresh token', { exact: true }).fill('fixture-refresh')
  await page.getByRole('button', { name: 'Connect for this session' }).click()
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled()
  expect(requests).toBe(1)
  await page.getByLabel('From date (India)').fill('2026-01-01')
  await page.getByLabel('Through date (India)').fill('2026-01-02')
  await page.getByRole('button', { name: 'Sync now', exact: true }).click()
  await expect(page.getByText('Requested sync complete.', { exact: false })).toBeVisible({ timeout: 45000 })
  await expect(page.locator('.kpi-card').filter({ hasText: 'Gross sales' }).locator('strong')).toContainText('100', { timeout: 20000 })
  const count = requests
  await page.reload()
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeDisabled()
  await expect(page.locator('.kpi-card').filter({ hasText: 'Gross sales' }).locator('strong')).toContainText('100')
  expect(requests).toBe(count)
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))
  expect(stored).not.toContain('fixture-secret')
  expect(stored).not.toContain('fixture-refresh')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
