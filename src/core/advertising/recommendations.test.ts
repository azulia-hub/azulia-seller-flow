import { expect, it } from 'vitest'
import { aggregateAdvertisingFacts, type AdvertisingMetrics } from './workspace'
import { recommendAdvertising } from './recommendations'
const metrics: AdvertisingMetrics = { ...aggregateAdvertisingFacts({ id: 'x', facts: [], grain: 'PRODUCT', moneyDecimals: 2, currency: 'INR', timezone: 'Asia/Kolkata', taxBasis: 'EXCLUDING_TAX', attributionDays: 7 }, { from: '2026-11-01', to: '2026-11-10', scope: { kind: 'ACCOUNT' } }).metrics, clicks: 30, purchases: 5, spend: 100, attributedSales: 1000, acos: 10 }
it('suggests at most a ten-percent test from an explicit target with enough mature evidence', () => {
  expect(recommendAdvertising(metrics, { completeCoverage: true, targetAcos: 30, currentBid: 10, status: 'ENABLED' })).toMatchObject({ action: 'RAISE', suggestedBid: 11 })
  expect(recommendAdvertising({ ...metrics, acos: 60 }, { completeCoverage: true, targetAcos: 30, currentBid: 10 })).toMatchObject({ action: 'LOWER', suggestedBid: 9 })
  expect(recommendAdvertising({ ...metrics, purchases: 0, attributedSales: 0, acos: null }, { completeCoverage: true, targetAcos: 30 })).toMatchObject({ action: 'LOWER', suggestedBid: null })
})
it('does not recommend raising paused targets or changing bids with missing, immature or small samples', () => {
  expect(recommendAdvertising(metrics, { completeCoverage: false, targetAcos: 30, currentBid: 10 }).action).toBe('HOLD')
  expect(recommendAdvertising(metrics, { completeCoverage: true, targetAcos: 30, status: 'PAUSED' }).action).toBe('CHECK')
  expect(recommendAdvertising({ ...metrics, clicks: 4 }, { completeCoverage: true, targetAcos: 30 }).action).toBe('HOLD')
  expect(recommendAdvertising({ ...metrics, purchases: null }, { completeCoverage: true, targetAcos: 30 }).action).toBe('HOLD')
  expect(() => recommendAdvertising(metrics, { completeCoverage: true, targetAcos: 0 })).toThrow('target ACOS')
})
