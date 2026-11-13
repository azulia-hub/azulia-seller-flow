import { test, expect } from '@playwright/test'

test('device storage worker preserves data, compression and conflict errors', async ({ page }) => {
  await page.route('**/worker-check', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Worker check</body></html>' }))
  await page.route('**/api/device/workspace**', async route => {
    if (route.request().method() === 'POST') {
      expect(route.request().headers()['x-azulia-intent']).toBe('device-workspace')
      expect(route.request().headers()['content-encoding']).toBe('gzip')
      const { gunzipSync } = await import('node:zlib')
      const sent = JSON.parse(gunzipSync(route.request().postDataBuffer()!).toString())
      expect(sent.value.amount).toBe('1234567890123.91')
      return route.fulfill({ status: 409, json: { error: 'Version conflict' } })
    }
    return route.fulfill({ json: { version: 7, value: { amount: '-0.01', unknown: '₹🪑' } } })
  })
  await page.goto('/worker-check')
  const result = await page.evaluate(async () => {
    const { workspaceTask } = await import('/src/adapters/device/workspaceWorker.ts' /* @vite-ignore */)
    const original = { amount: '1234567890123.91', unknown: '₹🪑'.repeat(500000) }
    const encoded = await workspaceTask({ action: 'encode', value: original })
    const decoded = await workspaceTask({ action: 'decode', raw: encoded })
    const saved = await workspaceTask({ action: 'read', key: 'settings' })
    let status = 0
    try { await workspaceTask({ action: 'write', key: 'settings', value: original, version: 1 }) } catch (error) { status = (error as Error & { status: number }).status }
    return { intact: JSON.stringify(decoded) === JSON.stringify(original), saved, status }
  })
  expect(result).toEqual({ intact: true, saved: { version: 7, value: { amount: '-0.01', unknown: '₹🪑' } }, status: 409 })
})
