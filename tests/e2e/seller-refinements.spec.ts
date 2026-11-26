import { expect, test } from '@playwright/test'
const csv = `date/time,settlement id,type,order id,sku,description,quantity,Transaction Status,product sales,selling fees,total,product image
1 Aug 2026 10:00:00 UTC,TEST,Order,ORDER-A,SKU-A,Oak shelf,1,Released,1000,0,1000,https://images.example.invalid/shelf.png
2 Aug 2026 10:00:00 UTC,TEST,Order,ORDER-B,SKU-B,Blue shelf,1,Deferred,500,0,500,
3 Aug 2026 10:00:00 UTC,TEST,Refund,ORDER-MISSING,SKU-A,Oak shelf,1,Released,-100,0,-100,
3 Aug 2026 12:00:00 UTC,TEST,Service Fee,ORDER-A,SKU-A,Fee,0,Deferred,0,-10,-10,
`
for (const width of [1280, 390]) test(`seller refinements: purchase-date filters, recorded activity and compact exclusions at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.route('**/api/report-sync/status', route => route.fulfill({ json: { configured: false, connectionKey: 'test', revision: 0, records: 0, missingWindows: 0, coverage: [], state: 'idle', lastSync: null, nextAttempt: null, error: null } }))
  await page.route('https://images.example.invalid/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#ddd"/></svg>' }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Upload report', exact: true }).first().click()
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'synthetic-refinements.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  const nav = page.getByRole('button', { name: 'Open navigation', exact: true })
  if (await nav.isVisible()) await nav.click()
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button', { name: 'Dashboard', exact: true }).click()
  await page.locator('.global-filter-card').evaluate((element: HTMLDetailsElement) => { element.open = true })
  await expect(page.getByLabel('Calculate by')).toHaveCount(0)
  await expect(page.locator('.global-filter-card')).toContainText('Orders by purchase date')
  if (width > 800) {
    const controls = await page.locator('.global-filter-fields > label select').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top))
    expect(Math.max(...controls) - Math.min(...controls)).toBeLessThan(2)
  }
  if (await nav.isVisible()) await nav.click()
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /financial records excluded/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Purchase date not verified')
  await expect(dialog).not.toContainText('Release not confirmed')
  await expect(dialog.locator('.excluded-records-list')).toContainText('ORDER-MISSING')
  const box = await dialog.boundingBox(); expect(box!.width).toBeLessThanOrEqual(width - 20)
  await page.screenshot({ path: `test-results/excluded-popup-${width}.png`, animations: 'disabled' })
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('.compact-cohort-scope')).toContainText('orders in this purchase period')
  if (await nav.isVisible()) await nav.click()
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button', { name: 'Dashboard', exact: true }).click()
  await expect(page.locator('.seller-products')).toContainText('Oak shelf')
  await expect(page.locator('.seller-products .product-thumbnail img').first()).toBeVisible()
  await page.screenshot({ path: `test-results/seller-filters-${width}.png`, animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

for (const width of [390, 1280]) test(`cost queue, saved filters and profit simulation at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.route('**/api/report-sync/status', route => route.fulfill({ json: { configured: false } }))
  await page.route('https://images.example.invalid/**', route => route.abort())
  await page.goto('/')
  const navigate = async (name: string) => {
    const mobileMenu = page.getByRole('button', { name: 'Open navigation', exact: true })
    if (await mobileMenu.isVisible()) await mobileMenu.click()
    await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button', { name, exact: true }).click()
  }
  await page.getByRole('button', { name: 'Upload report', exact: true }).first().click()
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'synthetic-scenario.csv', mimeType: 'text/csv', buffer: Buffer.from(csv.split('\n').slice(0, 3).join('\n')),
  })
  await navigate('Product costs')
  const queue = page.getByRole('region', { name: 'Missing-cost queue' })
  await expect(queue).toContainText('SKU-A')
  await queue.getByLabel('Default cost per unit').fill('400')
  await queue.getByRole('button', { name: 'Save and next' }).click()
  await expect(queue).toContainText('SKU-B')
  await navigate('Dashboard')
  const filters = page.locator('.global-filter-card')
  await filters.locator('summary').click()
  await filters.getByLabel('Time period').selectOption('LAST_3_DAYS')
  await filters.getByLabel('Save current filters as').fill('Recent sales')
  await filters.getByRole('button', { name: 'Save filter', exact: true }).click()
  await expect(filters.getByLabel('Saved filters')).toHaveValue('Recent sales')
  await filters.getByLabel('Time period').selectOption('ALL')
  await filters.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(filters.getByLabel('Time period')).toHaveValue('LAST_3_DAYS')
  await page.locator('.seller-products').getByText('Oak shelf', { exact: true }).click()
  const product = page.getByRole('region', { name: 'Product profile' })
  await expect(product.getByRole('button', { name: 'Copy SKU' })).toBeVisible()
  await product.getByText('Simulate profit', { exact: true }).click()
  await expect(product.getByText('Baseline contribution ₹600 across 1 unit.')).toBeVisible()
  await product.getByLabel('Selling price per unit').fill('800')
  for (const label of ['Estimated contribution', 'Contribution per unit sold', 'Break-even price']) {
    await expect(product.getByText(label, { exact: true }).locator('..').locator('dd')).toHaveText('₹400')
  }
  await product.getByRole('button', { name: 'Reset to baseline' }).click()
  await expect(product.getByLabel('Selling price per unit')).toHaveValue('1000')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
