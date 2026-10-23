import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir:'./tests/pwa', outputDir:'pwa-test-results', fullyParallel:false, workers:1, timeout:60000,
  expect:{ timeout:15000 }, reporter:[['list']],
  use:{ baseURL:'http://127.0.0.1:4180/azulia-seller-flow/', screenshot:'only-on-failure', trace:'retain-on-failure', launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : undefined },
  webServer:{ command:'node scripts/serve-built.mjs', url:'http://127.0.0.1:4180/azulia-seller-flow/', reuseExistingServer:false },
})
