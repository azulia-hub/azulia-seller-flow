import { expect, test } from '@playwright/test'

for (const width of [375, 1280]) test(`real advertising selectors and saved groups work in the app at ${width}px`, async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width, height: 850 })
  await page.goto('/')
  await page.evaluate(async () => {
    localStorage.setItem('azulia.report-delivery', 'manual')
    localStorage.setItem('azulia.ads-api.enabled', 'false')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sellerflow-sponsored-products', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('reports')
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('reports', 'readwrite')
      transaction.objectStore('reports').put({ id: 'integration-workbook', fileName: 'Synthetic integration report', importedAt: '2026-11-19T00:00:00Z', minDate: '2026-11-01', maxDate: '2026-11-18', rows: [
        { date: '2026-11-10', advertisedSku: 'white', advertisedAsin: 'B000000001', campaign: 'Main campaign', adGroup: 'Shared group', portfolio: '', spendExcludingTax: 900, attributedSales: 5000, advertisedSkuSales: 4000, otherSkuSales: 1000, impressions: 1000, clicks: 100, orders: 10, units: 10, raw: { campaignId: 'c1', adGroupId: 'g1' } },
        { date: '2026-11-10', advertisedSku: 'walnut', advertisedAsin: 'B000000002', campaign: 'Main campaign', adGroup: 'Shared group', portfolio: '', spendExcludingTax: 100, attributedSales: 1000, advertisedSkuSales: 800, otherSkuSales: 200, impressions: 100, clicks: 10, orders: 2, units: 2, raw: { campaignId: 'c1', adGroupId: 'g1' } },
      ] }, 'active')
      transaction.oncomplete = () => { db.close(); resolve() }; transaction.onerror = () => reject(transaction.error)
    })
  })
  await page.reload()
  async function advertising() {
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true })
    if (await menu.isVisible()) await menu.click()
    await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button', { name: 'Advertising', exact: true }).click()
    await expect(page.getByTestId('advertising-workspace')).toBeVisible()
  }
  await advertising()
  await expect(page.getByTestId('metric-card-spend')).toContainText('1,000')
  await expect(page.getByTestId('metric-card-acos')).toContainText('16.7%')
  await expect(page.getByTestId('metric-card-tacos')).toContainText('—')
  await expect(page.getByRole('region', { name: 'Amazon Ads connection' })).toHaveCount(0)
  await page.getByRole('tab', { name: 'Products', exact: true }).click()
  await page.getByRole('button', { name: 'white', exact: true }).click()
  const detail = page.getByTestId('entity-detail-drawer')
  await expect(detail.getByTestId('metric-card-spend')).toContainText('900')
  await detail.getByRole('tab', { name: 'Campaigns', exact: true }).click()
  await detail.getByRole('button', { name: 'Main campaign', exact: true }).click()
  await expect(detail.getByTestId('metric-card-spend')).toContainText('900')
  await page.keyboard.press('Escape')
  await expect(detail).toHaveCount(0)
  await page.getByRole('button', { name: '+ New custom group' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox').first().fill('Variants')
  await dialog.getByRole('checkbox', { name: /white/ }).check()
  await dialog.getByRole('checkbox', { name: /walnut/ }).check()
  await dialog.getByRole('button', { name: /Save/ }).click()
  await expect(page.getByTestId('entity-detail-drawer')).toContainText('Variants')
  await expect(page.getByTestId('entity-detail-drawer').getByTestId('metric-card-acos')).toContainText('16.7%')
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.reload(); await advertising()
  await page.getByLabel('Investigation Scope').selectOption('GROUP')
  await expect(page.getByLabel('Target Group')).toHaveValue(/.+/)
  await expect(page.getByLabel('Target Group')).toContainText('Variants')
  expect(errors).toEqual([])
})
