import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'

const report = path.resolve('src/adapters/amazon/__fixtures__/unified-transactions.csv')
const historicalReport = report

async function resetBrowserData(page: Page) {
  await page.goto('/')
  await page.evaluate(async () => {
    localStorage.clear()
    const databases = await indexedDB.databases()
    await Promise.all(databases.flatMap(database => database.name ? [new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(database.name!)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => resolve()
    })] : []))
  })
  await page.reload()
}

async function uploadReport(page: Page, file = report) {
  await page.getByRole('button', { name: /upload your first report/i }).click()
  await expect(page.getByText('Include extra transaction history')).toBeVisible()
  await page.locator('input[type="file"]').first().setInputFiles(file)
  await expect(page.locator('.report-status-card h3').filter({ hasText: path.basename(file) })).toBeVisible({ timeout: 30_000 })
}

test.beforeEach(async ({ page }) => resetBrowserData(page))

test('uploads a report and follows Dashboard → metric → SKU → order', async ({ page }) => {
  await uploadReport(page)
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await expect(page.getByText('Business snapshot')).toBeVisible()
  await expect(page.getByLabel('Time period')).toHaveValue('ALL')
  await expect(page.getByLabel('Calculation view')).toHaveValue('COMPLETED_ORDERS')
  await expect(page.getByText(/orders included/)).toBeVisible()
  await page.getByRole('button', { name: 'View excluded orders' }).click()
  await expect(page.getByRole('dialog')).toContainText('Refunds not included yet')
  await expect(page.getByRole('dialog')).toContainText('Original sale missing')
  await page.getByRole('button', { name: 'Close excluded orders snapshot' }).click()
  await page.getByLabel('Calculation view').selectOption('POSTED_ACTIVITY')
  await page.getByText('More financial details').click()
  await expect(page.getByRole('button', { name: /Profit per delivered unit/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Break-even TACOS/ })).toBeVisible()
  await page.getByRole('button', { name: /Gross sales/ }).first().click()
  await expect(page.getByRole('dialog')).toContainText('Gross sales by SKU')
  await page.locator('.metric-ranking tbody .clickable-order').first().click()
  await expect(page.getByRole('dialog')).toContainText('SKU snapshot')
  const order = page.locator('.sku-workspace > .sku-orders tbody tr.clickable-order').first()
  await order.scrollIntoViewIfNeeded()
  await order.click()
  await expect(page.locator('.inline-order-detail')).toContainText('Profit breakdown')
  await expect(page.locator('.inline-order-detail')).toContainText('Transaction timeline')
})

test('downloads an audit workbook for the active filters', async ({ page }) => {
  await uploadReport(page)
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export audit workbook' }).click()
  const result = await download
  expect(result.suggestedFilename()).toMatch(/-audit-export\.xml$/)
})

test('imports costs and persists them after reload', async ({ page }) => {
  await uploadReport(page)
  await page.getByRole('button', { name: /Data & Settings/i }).first().click()
  await page.locator('.bulk-costs textarea').fill('SKU\tUnit Cost\nSKU-RED\t275.00')
  await page.getByRole('button', { name: 'Import pasted costs' }).click()
  await expect(page.getByRole('status')).toContainText('1 costs imported and saved')
  await expect(page.getByLabel('SKU-RED unit cost')).toHaveValue('275')
  await page.reload()
  await page.getByRole('button', { name: /Data & Settings/i }).first().click()
  await expect(page.getByLabel('SKU-RED unit cost')).toHaveValue('275')
})

test('imports effective-dated cost history and shows its SKU trend', async ({ page }) => {
  await uploadReport(page)
  await page.getByRole('button', { name: /Data & Settings/i }).first().click()
  await page.locator('.bulk-costs textarea').fill('SKU,Unit Cost,Effective From\nSKU-RED,250,2026-01-01\nSKU-RED,275,2026-08-01')
  await page.getByRole('button', { name: 'Import pasted costs' }).click()
  await expect(page.getByRole('status')).toContainText('2 costs imported and saved')
  const chart = page.getByLabel('Cost history chart')
  await expect(chart).toContainText('2026-01-01')
  await expect(chart).toContainText('2026-08-01')
  await expect(chart).toContainText('+₹25.00 (+10%)')
})

test('bulk edits selected SKU costs with preview and undo', async ({ page }) => {
  await uploadReport(page)
  await page.getByRole('button', { name: /Data & Settings/i }).first().click()
  await page.locator('.bulk-costs textarea').fill('SKU,Unit Cost\nSKU-RED,250')
  await page.getByRole('button', { name: 'Import pasted costs' }).click()
  await page.getByText('Bulk edit selected SKUs').click()
  await page.getByLabel('Search SKUs for bulk editing').fill('SKU-RED')
  await page.locator('.bulk-sku-picker label').filter({ hasText: 'SKU-RED' }).getByRole('checkbox').check()
  await page.getByLabel('Change type').selectOption('INCREASE_PERCENT')
  await page.getByLabel('Percentage').fill('10')
  await page.getByLabel('Effective from Blank updates fallback').fill('2026-09-01')
  await expect(page.locator('.bulk-impact')).toContainText('1 SKU')
  await page.getByLabel('I reviewed the selected SKUs and COGS impact').check()
  await page.getByRole('button', { name: 'Apply and save' }).click()
  await expect(page.getByRole('status')).toContainText('1 SKU costs updated and saved')
  await page.getByRole('button', { name: 'Undo latest bulk update' }).click()
  await expect(page.getByRole('status')).toContainText('Latest bulk cost update was undone')
})

test('explains report snapshot differences with metric deltas', async ({ page }) => {
  await uploadReport(page, historicalReport)
  await page.locator('input[type="file"]').first().setInputFiles(report)
  await expect(page.getByText('Reports reconcile for the shared period')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.comparison-panel table')).toContainText('Gross sales')
})

test('expanded order audit fits a mobile viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await uploadReport(page)
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: /Dashboard/ }).click()
  await page.getByLabel('Calculation view').selectOption('POSTED_ACTIVITY')
  await page.getByRole('button', { name: /Gross sales/ }).first().click()
  await page.locator('.metric-ranking tbody .clickable-order').first().click()
  const order = page.locator('.sku-workspace > .sku-orders tbody tr.clickable-order').first()
  await order.scrollIntoViewIfNeeded()
  await order.click()
  const audit = page.locator('.inline-order-detail')
  await expect(audit).toBeVisible()
  const bounds = await audit.evaluate(element => ({ left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, viewport: document.documentElement.clientWidth, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }))
  expect(bounds.left).toBeGreaterThanOrEqual(0)
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewport + 1)
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth + 1)
})

test('fee audit workspace scrolls independently on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 640 })
  await uploadReport(page)
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: /Dashboard/ }).click()
  await page.getByLabel('Calculation view').selectOption('POSTED_ACTIVITY')
  await page.getByText('More financial details').click()
  await page.getByRole('button', { name: /Fee audit/ }).click()
  const body = page.locator('.fee-audit-body')
  await expect(body).toBeVisible()
  const scroll = await body.evaluate(element => {
    const before = element.scrollTop
    element.scrollTop = element.scrollHeight
    return { before, after: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, overflowY: getComputedStyle(element).overflowY }
  })
  expect(scroll.overflowY).toBe('auto')
  expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight)
  expect(scroll.after).toBeGreaterThan(scroll.before)
})
