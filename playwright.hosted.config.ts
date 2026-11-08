import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'hosted-sync.spec.ts', timeout: 90000,
  use: { baseURL: 'http://127.0.0.1:4175', launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : undefined },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4175', env: { VITE_AZULIA_DELIVERY: 'netlify' }, url: 'http://127.0.0.1:4175', reuseExistingServer: false },
})
