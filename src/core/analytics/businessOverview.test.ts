import { expect, it } from 'vitest'
import { buildBusinessOverview } from './businessOverview'

it('counts known order identities without manufacturing financial value before postings arrive', () => {
  const result = buildBusinessOverview([], [], 'BLOCK', undefined, ['A', 'B', 'A'])
  expect(result.orderCount).toBe(2)
  expect(result.summary.grossSales).toBe(0)
  expect(result.summary.marketplaceCharges).toBe(0)
  expect(result.costStatus.netCogs).toBe(0)
})
