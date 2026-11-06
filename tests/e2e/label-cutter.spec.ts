import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import * as pdf from 'mupdf'
import { labelPdf } from '../fixtures/labelPdf'

async function openTools(page: Page) {
  await page.goto('/')
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button', { name: 'Tools', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Amazon PDF Cutter' })).toBeVisible()
}
const fixture = (name: string, labelId: number) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(labelPdf({ merged: true, labelId })) })

for (const mobile of [false, true]) test(`PDF cutter prepares local downloads on ${mobile ? 'mobile' : 'desktop'}`, async ({ page }) => {
  await page.setViewportSize(mobile ? { width: 375, height: 812 } : { width: 1440, height: 1000 })
  const errors: string[] = [], uploads: string[] = [], navigations: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations.push(frame.url()) })
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) uploads.push(request.url()) })
  await openTools(page)
  await expect(page.getByRole('button', { name: 'Prepare labels', exact: true })).toBeDisabled()
  await page.getByLabel('Amazon label PDFs').setInputFiles([fixture('b.pdf', 10), fixture('a.pdf', 20)])
  await expect(page.locator('.pdf-queue li').first()).toContainText('a.pdf')
  await page.getByRole('button', { name: 'Move b.pdf up' }).click()
  await expect(page.locator('.pdf-queue li').first()).toContainText('b.pdf')
  await page.getByRole('checkbox', { name: /Also create a product-wise packing list/ }).check()
  await page.getByRole('button', { name: 'Prepare labels', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Prepared labels' })).toContainText('4 labels · 24 ordered units · 1 A4 sheet', { timeout: 30_000 })
  await expect(page.getByRole('link', { name: 'Packing list PDF', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Packing list CSV', exact: true })).toBeVisible()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Download labels PDF', exact: true }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe('amazon-labels.pdf')
  const document = new pdf.PDFDocument(readFileSync((await download.path())!))
  try {
    expect(document.countPages()).toBe(1)
    const page = document.loadPage(0), text = page.toStructuredText('')
    expect(page.getBounds()).toEqual([0, 0, 595, 842])
    expect(text.asText().match(/3 PRODUCTS \| TOTAL QTY: 6/g)).toHaveLength(4)
    expect(text.asText()).not.toContain('HSN:'); text.destroy(); page.destroy()
  } finally { document.destroy() }
  const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }))
  expect(size.scroll).toBeLessThanOrEqual(size.width + 1)
  await page.getByRole('combobox', { name: 'Appearance' }).selectOption('dark')
  expect(await page.locator('.pdf-cutter').evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
  await page.screenshot({ path: `test-results/pdf-cutter-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true, animations: 'disabled' })
  expect(errors).toEqual([]); expect(uploads).toEqual([])
  expect(navigations).toHaveLength(1)
})

test('PDF cutter rejects the whole batch and recovers after a bad file', async ({ page }) => {
  await openTools(page)
  const file = fixture('duplicate.pdf', 30)
  await page.getByLabel('Amazon label PDFs').setInputFiles([file, { ...file, name: 'copy.pdf' }])
  await page.getByRole('button', { name: 'Prepare labels', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('same input PDF', { timeout: 30_000 })
  await expect(page.getByRole('link', { name: 'Download labels PDF', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Remove copy.pdf', exact: true }).click()
  await page.getByRole('button', { name: 'Prepare labels', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Prepared labels' })).toContainText('2 labels', { timeout: 30_000 })
  await page.getByRole('button', { name: 'Clear files' }).click()
  await expect(page.getByRole('link', { name: 'Download labels PDF', exact: true })).toHaveCount(0)
})

test('PDF cutter cancellation leaves the selected files available for retry', async ({ page }) => {
  await openTools(page)
  await page.getByLabel('Amazon label PDFs').setInputFiles(fixture('retry.pdf', 40))
  let releaseFonts: () => void = () => {}
  const fontsHeld = new Promise<void>(resolve => { releaseFonts = resolve })
  await page.route('**/fonts/*.ttf', async route => { await fontsHeld; await route.abort().catch(() => {}) })
  await page.getByRole('button', { name: 'Prepare labels', exact: true }).click()
  const cancel = page.getByRole('button', { name: 'Cancel', exact: true })
  await cancel.click()
  releaseFonts()
  await expect(page.getByRole('button', { name: 'Prepare labels', exact: true })).toBeEnabled()
  await expect(page.locator('.pdf-queue')).toContainText('retry.pdf')
  await expect(page.getByRole('link', { name: 'Download labels PDF', exact: true })).toHaveCount(0)
})
