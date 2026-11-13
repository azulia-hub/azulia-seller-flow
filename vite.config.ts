import { offlineShell } from './scripts/viteOffline'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react(), offlineShell()],
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022', rollupOptions:{input:{app:'index.html',background:'background.html'}} },
  server: { watch: { ignored: ['**/android/**', '**/.local/**', '**/playwright-report/**', '**/test-results/**'] } },
  optimizeDeps: { entries: ['index.html'], include: ['mupdf'], esbuildOptions: { target: 'es2022' } },
  test: {
    include: ['src/**/*.test.ts', 'tests/integration/**/*.test.ts'],
  },
})
