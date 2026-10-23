import { offlineShell } from './scripts/viteOffline'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react(), offlineShell()],
  base: './',
  test: {
    include: ['src/**/*.test.ts', 'tests/integration/**/*.test.ts'],
  },
})
