import { expect, test } from '@playwright/test'

for (const width of [375, 1280]) {
  test.describe(`Advertising Workspace UI at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 850 })
      await page.goto('/tests/fixtures/advertisingWorkspaceHarness.html')
      await expect(page.getByTestId('advertising-workspace')).toBeVisible()
    })

    test('renders primary context, KPIs and responsive layout without horizontal overflow', async ({
      page,
    }) => {
      // Header and brand meta
      await expect(page.getByRole('heading', { name: 'Advertising Workspace' })).toBeVisible()
      await expect(page.getByText('RoyalFurnitures53', { exact: true })).toBeVisible()
      await expect(page.getByText('Sponsored Products only', { exact: true })).toBeVisible()

      // Freshness & coverage
      await expect(page.getByLabel('Coverage and freshness')).toContainText('2026-10-20 – 2026-11-18')
      await expect(page.getByLabel('Coverage and freshness')).toContainText('Spend before GST')

      // 5 Primary Summary Metrics
      await expect(page.getByTestId('metric-card-spend')).toContainText('Ad spend')
      await expect(page.getByTestId('metric-card-attributedSales')).toContainText('Attributed sales')
      await expect(page.getByTestId('metric-card-acos')).toContainText('ACOS')
      await expect(page.getByTestId('metric-card-roas')).toContainText('ROAS')
      await expect(page.getByTestId('metric-card-tacos')).toContainText('TACOS')

      // Needs review section
      await expect(page.getByRole('heading', { name: /Needs review/ })).toBeVisible()
      await expect(page.getByText('Spend without purchases')).toBeVisible()

      // Trend chart
      await expect(page.getByRole('heading', { name: 'Daily performance trend' })).toBeVisible()

      // Verify no horizontal document overflow
      const noOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
      expect(noOverflow).toBe(true)
    })

    test('switches across available view tabs: Overview, Campaigns, Products, Search terms', async ({
      page,
    }) => {
      // 1. Campaigns view
      await page.getByRole('tab', { name: 'Campaigns' }).click()
      await expect(page.getByPlaceholder('Search campaigns...')).toBeVisible()
      await expect(page.getByRole('table')).toContainText('SPA_Penetration_mix_erp')

      // 2. Products view
      await page.getByRole('tab', { name: 'Products' }).click()
      await expect(page.getByText('Product join policy:')).toBeVisible()
      await expect(page.getByPlaceholder('Search products by SKU or title...')).toBeVisible()
      await expect(page.getByRole('table')).toContainText('Solid Teak Coffee Table')
      await expect(page.getByRole('table')).toContainText('Total Sales')

      // 3. Search terms view
      await page.getByRole('tab', { name: 'Search terms' }).click()
      await expect(page.getByText('Customer search attribution:')).toBeVisible()
      await expect(page.getByRole('table')).toContainText('teak wood coffee table')

      // 4. Return to Overview
      await page.getByRole('tab', { name: 'Overview' }).click()
      await expect(page.getByTestId('metric-card-spend')).toBeVisible()
    })

    test('opens entity detail drawer with targets, cross-sales and navigates back', async ({
      page,
    }) => {
      // Click a campaign link to open entity detail
      await page.getByRole('button', { name: 'SPA_Penetration_mix_erp' }).first().click()

      const drawer = page.getByTestId('entity-detail-drawer')
      await expect(drawer).toBeVisible()
      await expect(drawer.getByRole('heading', { name: 'SPA_Penetration_mix_erp' })).toBeVisible()

      // Targets & Bids section
      await drawer.getByRole('tab', { name: 'Targets & Bids' }).click()
      await expect(drawer.getByText('Configured bid reflects current entity configuration')).toBeVisible()
      await expect(drawer.getByRole('table')).toContainText('coffee table')
      await expect(drawer.getByRole('table')).toContainText('Target bid')

      // Cross-sales section
      await drawer.getByRole('tab', { name: 'Cross-Sales' }).click()
      await expect(drawer.getByText('Aggregate Amazon attribution from 7-day click window')).toBeVisible()
      await expect(drawer.getByText('27-I31F-NB1O')).toBeVisible()
      await expect(drawer.getByText('SKU-TABLE-02')).toBeVisible()
      await expect(drawer.getByText('In selected group', { exact: true })).toBeVisible()

      // Close drawer with Back button
      await drawer.getByRole('button', { name: 'Back to workspace' }).click()
      await expect(drawer).not.toBeVisible()
    })

    test('supports custom group creation through accessible modal', async ({ page }) => {
      // Open group modal
      await page.getByRole('button', { name: '+ New custom group' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Create custom product group' })).toBeVisible()

      // Fill group name
      await page.getByLabel('Group Name *').fill('Dining Sets Q4')

      // Select first two products
      const checkboxes = page.locator('.adsw-picker-item input[type="checkbox"]')
      await checkboxes.nth(0).check()
      await checkboxes.nth(1).check()

      // Save group
      await page.getByRole('button', { name: 'Save group' }).click()

      // Verify modal closes and group name is recorded
      await expect(page.getByRole('dialog')).not.toBeVisible()
      await expect(page.getByTestId('harness-saved-group')).toHaveText('Dining Sets Q4')
    })

    test('supports scope switching and refresh / settings callbacks', async ({ page }) => {
      // Refresh button
      await page.getByRole('button', { name: 'Refresh advertising reports' }).click()
      await expect(page.getByTestId('harness-refresh-count')).toHaveText('1')

      // Settings button
      await page.getByRole('button', { name: 'Advertising settings' }).click()
      await expect(page.getByTestId('harness-settings-status')).toHaveText('opened')

      // Scope change to Product
      await page.getByLabel('Investigation Scope').selectOption('PRODUCT')
      await expect(page.getByLabel('Target Product')).toBeVisible()

      // Scope change to Group
      await page.getByLabel('Investigation Scope').selectOption('GROUP')
      await expect(page.getByLabel('Target Group')).toBeVisible()
    })
  })
}
