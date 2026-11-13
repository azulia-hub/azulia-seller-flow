import { createServer } from 'vite'
import { performance } from 'node:perf_hooks'
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
try {
  const { summarizeProductProfitability } = await server.ssrLoadModule('/src/core/analytics/orderProfit.ts')
  const { calculateCosts } = await server.ssrLoadModule('/src/core/costs/calculateCosts.ts')
  const { buildReportSearchIndex } = await server.ssrLoadModule('/src/core/search/reportSearch.ts')
  const orderCount = Number(process.argv[2] || 3000), skuCount = 150
  const costs = Array.from({ length: skuCount }, (_, i) => ({ sku: `SKU-${i}`, unitCost: 100 + i, updatedAt: '' }))
  const events = []
  for (let i = 0; i < orderCount; i++) {
    const sku = `SKU-${i % skuCount}`, day = `${1 + i % 28}`.padStart(2, '0')
    const base = { source: 'synthetic', sourceDatasetId: 'benchmark', sourceRow: i, date: `2026-08-${day}`, orderId: `ORDER-${i}`, sku, quantity: 1, amountClass: 'OPERATING', state: 'Example state', city: 'Example city', status: 'Released', rawType: 'Sale', rawDescription: `Product ${i % skuCount}`, classified: true, raw: {} }
    events.push({ ...base, id: `${i}-sale`, event: 'SALE', amountType: 'PRODUCT_REVENUE', amount: 1000 }, { ...base, id: `${i}-fee`, event: 'FEE', amountType: 'COMMISSION', amount: -100 })
    if (i % 5 === 0) events.push({ ...base, id: `${i}-refund`, event: 'REFUND', amountType: 'PRODUCT_REVENUE', amount: -1000, returnType: 'CUSTOMER_RETURN' })
  }
  const measure = (name, run) => { const start = performance.now(); const result = run(); return { name, milliseconds: Math.round(performance.now() - start), result } }
  const costRun = measure('costs', () => calculateCosts(events, costs))
  const productRun = measure('products', () => summarizeProductProfitability(events, costs, 'BLOCK'))
  const searchRun = measure('search-index', () => buildReportSearchIndex(events))
  console.log(JSON.stringify({ orders: orderCount, events: events.length, skus: skuCount, timings: [costRun, productRun, searchRun].map(({name,milliseconds})=>({name,milliseconds})), checks: { cost: costRun.result.netCogs, profit: productRun.result.reduce((sum,p)=>sum+p.profit,0), products: productRun.result.length, searchDocuments: searchRun.result.length } }, null, 2))
} finally { await server.close() }
