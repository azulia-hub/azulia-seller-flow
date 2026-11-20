import { expect, test } from '@playwright/test'

for (const width of [375, 1280]) {
  test(`Amazon Ads connection is usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/tests/fixtures/adsHarness.html')
    const panel = page.getByRole('region', { name: 'Amazon Ads connection' })
    await expect(panel.getByText('Fixture seller', { exact: true })).toBeVisible()
    await expect(panel.getByText('Advertising reports connected.', { exact: true })).toBeVisible()
    const enabled = panel.getByRole('checkbox', { name: 'Use connected advertising reports' }), refresh = panel.getByRole('button', { name: 'Refresh advertising reports' })
    await enabled.uncheck()
    await expect(refresh).toBeDisabled()
    await expect(panel.getByText('Showing your uploaded workbook.', { exact: false })).toBeVisible()
    await enabled.check(); await refresh.click()
    await expect(page.getByTestId('refresh-count')).toHaveText('1')
    await expect(refresh).toBeDisabled()
    await expect(panel.getByRole('status')).toContainText('Preparing Sponsored Products reports')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}
