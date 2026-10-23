import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { chromium, expect, test } from '@playwright/test'
import path from 'node:path'

async function ready(page: import('@playwright/test').Page) {
  await page.goto('./')
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
}

test('install manifest has correct scoped launch, logo sizes and maskable icon', async ({ page,context }) => {
  await ready(page)
  const metadata = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel=manifest]')!
    const manifest = await fetch(link.href).then(response => response.json())
    const icons = await Promise.all(manifest.icons.map(async (icon:{ src:string; sizes:string; purpose:string }) => {
      const bitmap = await createImageBitmap(await fetch(new URL(icon.src,link.href)).then(response => response.blob()))
      return { ...icon, width:bitmap.width, height:bitmap.height }
    }))
    return { manifest, icons, manifestUrl:link.href }
  })
  expect(metadata.manifest).toMatchObject({ name:'Azulia Seller Flow', short_name:'Azulia', display:'standalone', start_url:'./', scope:'./' })
  expect(metadata.icons).toEqual(expect.arrayContaining([expect.objectContaining({ sizes:'192x192',width:192,height:192 }),expect.objectContaining({ sizes:'512x512',width:512,height:512,purpose:'maskable' })]))
  const cdp = await context.newCDPSession(page)
  await cdp.send('Page.enable')
  const manifest = await cdp.send('Page.getAppManifest')
  expect(manifest.errors).toEqual([])
  expect((await cdp.send('Page.getInstallabilityErrors')).installabilityErrors.filter(error => error.errorId !== 'in-incognito')).toEqual([])
  await expect(page.getByRole('button',{ name:'Install Azulia',exact:true })).toBeVisible()
  await page.getByRole('button',{ name:'Install Azulia',exact:true }).click()
  await expect(page.getByRole('dialog',{ name:'Install Azulia',exact:true })).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('img',{ name:'Azulia app icon' })).toBeVisible()
  await page.getByRole('button',{ name:'Done',exact:true }).click()
})

test('install action uses the native browser prompt when available', async ({ page }) => {
  await ready(page)
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt',{ cancelable:true })
    Object.assign(event,{ prompt:async () => { document.documentElement.dataset.installPromptCalled = 'yes' }, userChoice:Promise.resolve({ outcome:'accepted' }) })
    dispatchEvent(event)
  })
  await page.getByRole('button',{ name:'Install Azulia',exact:true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-install-prompt-called','yes')
  await page.evaluate(() => dispatchEvent(new Event('appinstalled')))
  await expect(page.getByRole('button',{ name:'Azulia installed',exact:true })).toBeDisabled()
})

for (const width of [1280,375]) test(`offline shell and saved report reopen under nested hosting at ${width}px`, async ({ page,context }) => {
  await page.setViewportSize({ width,height:900 })
  await ready(page)
  await page.getByRole('button',{ name:/upload your first report/i }).click()
  await page.locator('input[type=file]').first().setInputFiles(path.resolve('src/adapters/amazon/__fixtures__/unified-transactions.csv'))
  await expect(page.locator('.report-status-card h3')).toContainText('unified-transactions.csv')
  const menu = page.getByRole('button',{ name:'Open navigation',exact:true })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('navigation',{ name:'Main navigation' }).getByRole('button',{ name:'Dashboard',exact:true }).click()
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.current-report')).toContainText('unified-transactions.csv')
  await expect(page.getByText('You’re offline.',{ exact:false })).toBeVisible()
  await page.getByRole('searchbox',{ name:'Search your report',exact:true }).fill('SKU-RED')
  await page.locator('.report-search-results').getByRole('button',{ name:/^Product / }).click()
  await expect(page.getByRole('region',{ name:'Product profile',exact:true })).toContainText('SKU-RED')
  await page.screenshot({ path:`pwa-test-results/pwa-offline-${width}.png`,animations:'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
})

test('updates wait for explicit reload and keep saved reports', async ({ page,request }) => {
  await ready(page)
  await page.getByRole('button',{ name:/upload your first report/i }).click()
  await page.locator('input[type=file]').first().setInputFiles(path.resolve('src/adapters/amazon/__fixtures__/unified-transactions.csv'))
  await expect(page.locator('.report-status-card h3')).toContainText('unified-transactions.csv')
  await request.post('http://127.0.0.1:4180/__test__/release')
  await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration!.update() })
  await expect(page.getByRole('button',{ name:'Update and reload',exact:true })).toBeVisible()
  await expect(page.locator('.report-status-card h3')).toContainText('unified-transactions.csv')
  await page.getByRole('button',{ name:'Update and reload',exact:true }).click()
  await expect(page.locator('.current-report')).toContainText('unified-transactions.csv')
  await expect(page.getByRole('button',{ name:'Update and reload',exact:true })).toHaveCount(0)
})

// Normal-profile Chromium validates the browser criteria that private test contexts cannot satisfy.
test('normal browser profile recognizes Azulia as installable', async () => {
  const directory = await mkdtemp(path.join(tmpdir(),'azulia-install-profile-'))
  const context = await chromium.launchPersistentContext(directory,{ headless:true, executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH })
  try {
    const page = context.pages()[0]
    await page.goto('http://127.0.0.1:4180/azulia-seller-flow/')
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
    const cdp = await context.newCDPSession(page)
    await cdp.send('Page.enable')
    await expect.poll(async () => (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors).toEqual([])
  } finally { await context.close(); await rm(directory,{ recursive:true,force:true }) }
})
