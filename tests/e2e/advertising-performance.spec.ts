import { expect, test } from '@playwright/test'
for (const width of [375, 1280]) test(`large Ads reports stay responsive and paginate detail rows at ${width}px`, async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width, height: 850 })
  await page.addInitScript(() => {
    const Original = window.Worker
    ;(window as any).adsCalculations = 0
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options)
        if (String(url).includes('workspace.worker')) {
          const originalPost = this.postMessage.bind(this)
          this.postMessage = ((...args: Parameters<Worker['postMessage']>) => { (window as any).adsCalculations++; originalPost(...args) }) as Worker['postMessage']
        }
      }
    }
  })
  const common = { date: '2026-11-10', campaignId: 'c', campaignName: 'Campaign', adGroupId: 'g', adGroupName: 'Group', impressions: 10, clicks: 2, cost: 1, sales7d: 5, attributedSalesSameSku7d: 4, salesOtherSku7d: 1, purchases7d: 1, unitsSoldClicks7d: 1 }
  const rows = {
    searchTerm: Array.from({ length: 10000 }, (_, i) => ({ ...common, keywordId: `k${i % 1000}`, keyword: i === 5999 ? 'Metal shelf' : `Keyword ${i % 1000}`, searchTerm: `term ${i % 6000}` })),
    targeting: Array.from({ length: 4000 }, (_, i) => ({ ...common, keywordId: `k${i % 1000}`, keyword: `Keyword ${i % 1000}` })),
    purchasedProduct: [],
  }
  const entities = { campaigns: [{ campaignId: 'c', state: 'ENABLED' }], adGroups: [{ campaignId: 'c', adGroupId: 'g', state: 'ENABLED', defaultBid: 5 }], productAds: [{ campaignId: 'c', adGroupId: 'g', sku: 'SKU', adId: 'a' }], keywords: Array.from({ length: 1000 }, (_, i) => ({ campaignId: 'c', adGroupId: 'g', keywordId: `k${i}`, keywordText: `Keyword ${i}`, bid: 5, state: 'ENABLED', matchType: 'EXACT' })), targets: [] }
  await page.route('**/api/ads/**', async route => {
    const url = new URL(route.request().url()), kind = url.searchParams.get('kind') ?? 'advertisedProduct'
    let body: unknown = { configured: true, profileId: '123', revision: 1, state: 'idle', error: null }
    if (url.pathname.endsWith('/dataset')) body = { kind, profileId: '123', revision: 1, report: { id: `ads-${kind}:123`, kind, configurationVersion: 2, profileId: '123', minDate: '2026-11-01', maxDate: '2026-11-21', importedAt: '2026-11-22T00:00:00Z', rows: rows[kind as keyof typeof rows] } }
    if (url.pathname.endsWith('/entities')) body = { kind, profileId: '123', rows: entities[kind as keyof typeof entities], observedAt: new Date().toISOString(), nextToken: null }
    if (url.pathname.endsWith('/catalog')) body = { asin: url.searchParams.get('asin'), title: 'Synthetic product', imageUrl: null }
    await route.fulfill({ json: body })
  })
  await page.goto('/tests/fixtures/advertisingPerformanceHarness.html')
  await expect(page.getByTestId('metric-card-spend')).toContainText('3000.00')
  await expect(page.getByRole('tab', { name: 'Search terms', exact: true })).toBeVisible()
  const before = Number(await page.getByTestId('heartbeat').textContent())
  const calculations = await page.evaluate(() => (window as any).adsCalculations)
  await expect.poll(async () => Number(await page.getByTestId('heartbeat').textContent())).toBeGreaterThan(before + 6)
  expect(await page.evaluate(() => (window as any).adsCalculations)).toBeLessThanOrEqual(calculations + 1)
  await page.getByRole('tab', { name: 'Search terms', exact: true }).click()
  await expect(page.locator('.adsw-view-content tbody tr')).toHaveCount(30)
  const termPages = page.getByRole('navigation', { name: 'search terms table pages' })
  await expect(termPages.getByRole('button', { name: '← Previous', exact: true })).toBeDisabled()
  await termPages.getByRole('button', { name: 'Next →', exact: true }).click()
  await expect(termPages).toContainText('Page 2 of')
  await page.getByRole('button', { name: 'Sort direction: Descending', exact: true }).click()
  await expect(termPages).toContainText('Page 1 of')
  await expect(page.getByRole('button', { name: 'Sort direction: Ascending', exact: true })).toBeVisible()
  const termTable = page.getByRole('table', { name: 'Search term performance' })
  await expect(termTable.getByRole('row', { name: /All search terms total/ })).toContainText('₹10000.00')
  const firstSpend = termTable.locator('tbody tr').first().getByRole('cell').nth(1)
  await expect(firstSpend).toContainText('1.00')
  await termTable.getByRole('button', { name: 'Spend, sort descending' }).click()
  await expect(firstSpend).toContainText('2.00')
  await termTable.getByRole('button', { name: 'Spend, restore default order' }).click()
  await expect(termTable.getByRole('button', { name: 'Spend, sort ascending' })).toBeVisible()
  await expect(firstSpend).toContainText('2.00')
  const termSearch = page.getByPlaceholder('Search buyer query, target or campaign...')
  await termSearch.fill('term 5999')
  await expect(page.locator('.adsw-view-content tbody tr')).toHaveCount(1)
  await expect(page.locator('.adsw-view-content tbody')).toContainText('term 5999')
  await expect(termPages.getByRole('button', { name: 'Next →', exact: true })).toBeDisabled()
  const matchedTotal = termTable.getByRole('row', { name: /Matching terms total/ })
  await expect(matchedTotal).toContainText('₹1.00')
  await expect(matchedTotal).toContainText('₹5.00')
  await expect(matchedTotal).toContainText('20.0%')
  await page.getByRole('radio', { name: 'Target keyword / ASIN' }).check()
  await termSearch.fill('metla shelf')
  await expect(termTable.locator('tbody')).toContainText('term 5999')
  await expect(matchedTotal).toContainText('₹1.00')
  await page.getByRole('radio', { name: 'Customer search term' }).check()
  await expect(termTable.locator('tbody')).toContainText('No search terms found')
  await expect(matchedTotal).toContainText('₹0.00')
  await termSearch.fill('')
  await expect(termTable.getByRole('row', { name: /All search terms total/ })).toContainText('₹10000.00')
  await page.getByRole('tab', { name: 'Campaigns', exact: true }).click()
  await page.getByRole('button', { name: 'Campaign', exact: true }).click()
  const drawer = page.getByTestId('entity-detail-drawer')
  await drawer.getByRole('tab', { name: 'Targets & Bids' }).click()
  await expect(drawer.locator('tbody tr')).toHaveCount(30)
  await drawer.getByRole('button', { name: 'Next rows' }).click()
  await expect(drawer).toContainText('Page 2 of 34')
  await expect(drawer).toContainText('Keyword 30')
  await page.mouse.wheel(0, 600)
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
