// Opt-in local verification. Private records and control amounts must never be committed.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseSponsoredProductsWorkbook } from '../../src/adapters/amazon/sponsoredProductsAdapter'
import { amazonUnifiedTransactionAdapter, normalizeAmazonSku } from '../../src/adapters/amazon/unifiedTransactionAdapter'
import { parseCsvDataset } from '../../src/core/csv/parseCsv'
import { filterEvents } from '../../src/core/analytics/dashboardSummary'
import { buildSponsoredProductsAttribution, summarizeSponsoredPerformance } from '../../src/core/advertising/sponsoredProducts'

const enabled = Boolean(process.env.AZULIA_ADS_FILE && process.env.AZULIA_UNIFIED_FILE && process.env.AZULIA_ADS_CONTROLS)
describe.skipIf(!enabled)('private source reports against independent Python controls', () => {
  it('matches every advertised SKU, performance total and full-source financial reconciliation', async () => {
    const controls = JSON.parse(readFileSync(process.env.AZULIA_ADS_CONTROLS!, 'utf8'))
    const bytes = readFileSync(process.env.AZULIA_ADS_FILE!)
    const report = await parseSponsoredProductsWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), 'private.xlsx', 'private')
    const dataset = amazonUnifiedTransactionAdapter.normalize(parseCsvDataset(readFileSync(process.env.AZULIA_UNIFIED_FILE!, 'utf8'), 'private', 'private.csv'))
    expect(dataset.quality.reconciliation.reconciled).toBe(true)
    expect(dataset.quality.reconciliation.normalizedTotal).toBeCloseTo(controls.sourceFinancialTotal, 2)
    const rows = report.rows.filter(row => row.date >= controls.from && row.date <= controls.to)
    expect(rows.length).toBe(controls.selectedRows)
    const totals = summarizeSponsoredPerformance(rows)
    for (const [metric, amount] of Object.entries(controls.totals)) expect(totals[metric as keyof typeof totals], `Total ${metric}`).toBeCloseTo(amount as number, 2)
    for (const [sku, values] of Object.entries(controls.byAdvertisedSku)) {
      const actual = summarizeSponsoredPerformance(rows.filter(row => row.advertisedSku === sku))
      for (const [metric, amount] of Object.entries(values as Record<string, number>)) expect(actual[metric as keyof typeof actual], `SKU control ${metric}`).toBeCloseTo(amount, 2)
    }
    const events = filterEvents(dataset.events, { fromDate: controls.from, toDate: controls.to })
    const joined = buildSponsoredProductsAttribution(events, report, { from: controls.from, to: controls.to }, { identityEvents: dataset.events, normalizeSku: normalizeAmazonSku })
    expect(joined.status).toBe('AVAILABLE')
    expect(joined.skus.length).toBeGreaterThan(0)
    expect(joined.matchedSpend).toBeGreaterThan(0)
    expect(joined.matchedSpend + joined.unmatchedSpend).toBeCloseTo(controls.totals.spend, 2)
    for (const sku of joined.skus) {
      const expectedSpend = Object.entries(controls.byAdvertisedSku as Record<string, { spend: number }>).filter(([advertisedSku]) => advertisedSku === sku.sku || advertisedSku.replace(/-MFN$/, '') === sku.sku).reduce((total, [, values]) => total + values.spend, 0)
      expect(sku.spend, 'Joined SKU source spend').toBeCloseTo(expectedSpend, 2)
      expect(sku.acos).toBe(sku.attributedSales > 0 ? sku.spend / sku.attributedSales * 100 : null)
    }
    expect(joined).not.toHaveProperty('actualAdvertisingTax')
    expect(joined.skus.reduce((total, sku) => total + sku.spend, 0)).toBeCloseTo(joined.matchedSpend, 2)
    expect(joined.reconciliationDifference).toBeCloseTo(joined.unifiedAdsCost - controls.totals.spend, 2)
  })
})
