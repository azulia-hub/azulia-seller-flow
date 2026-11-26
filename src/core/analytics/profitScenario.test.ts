import { expect, it } from 'vitest'
import type { CanonicalFinancialEvent } from '../data/types'
import { summarizeSkuProfit } from './orderProfit'
import { calculateProfitScenario, profitScenarioBaseline } from './profitScenario'

const sale: CanonicalFinancialEvent = {
  id: 'sale', orderId: 'order', sku: 'sku', date: '2026-11-20', event: 'SALE', amountType: 'PRODUCT_REVENUE',
  amount: 1000, amountClass: 'OPERATING', quantity: 10, source: 'test', sourceDatasetId: 'test', sourceRow: 1,
  state: null, city: null, status: null, rawType: 'sale', rawDescription: null, classified: true, raw: {},
}
const records: CanonicalFinancialEvent[] = [
  sale,
  { ...sale, id: 'refund', event: 'REFUND', quantity: 2, amount: -200 },
  { ...sale, id: 'fee', event: 'FEE', amountType: 'COMMISSION', quantity: null, amount: -100 },
  { ...sale, id: 'transfer', event: 'SETTLEMENT', amountType: 'OTHER', amountClass: 'SETTLEMENT', quantity: null, amount: -700 },
]
const costs = [{ sku: 'sku', unitCost: 40, updatedAt: '' }]

it('reproduces the historical contribution and computes a lower-price scenario', () => {
  const summary = summarizeSkuProfit(records, 'sku', costs, 'BLOCK')
  const baseline = profitScenarioBaseline(summary, 80)!
  const input = { price: 100, unitCost: 40, returnRate: .2, adSpend: 80, units: 10 }
  expect(baseline).toMatchObject({ price: 100, unitCost: 40, contribution: 300 })
  expect(calculateProfitScenario(baseline, input)).toEqual({
    contribution: 300, perUnit: 30, breakEvenPrice: 62.5, unitsToMatch: 10,
  })
  expect(calculateProfitScenario(baseline, { ...input, price: 90 })).toMatchObject({
    contribution: 220, unitsToMatch: 13,
  })
  expect(calculateProfitScenario(baseline, { ...input, returnRate: 1 })?.breakEvenPrice).toBeNull()
  expect(calculateProfitScenario(baseline, { ...input, units: 0 })).toBeNull()
})

it('blocks estimates for missing costs even under the assume-zero policy', () => {
  expect(profitScenarioBaseline(summarizeSkuProfit(records, 'sku', [], 'ASSUME_ZERO'), null)).toBeNull()
})
