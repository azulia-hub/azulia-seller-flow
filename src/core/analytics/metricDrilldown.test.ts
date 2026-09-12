import { describe, expect, it } from 'vitest'
import type { SkuProfitSummary } from './orderProfit'
import { buildPortfolioConcentration, buildSkuActionBoard } from './metricDrilldown'

const sku = (name: string, grossSales: number, profit: number, profitMargin: number, returnRate = 0): SkuProfitSummary => ({ sku: name, grossSales, profit, profitMargin, returnRate, soldQuantity: 10, rtoQuantity: returnRate ? 1 : 0, customerReturnQuantity: returnRate >= 20 ? 1 : 0, shippingFees: -100, orders: [{ orderId: `${name}-order` }] } as unknown as SkuProfitSummary)

describe('SKU action board', () => {
  it('places every active SKU into one explainable decision group', () => {
    const board = buildSkuActionBoard([sku('star', 1000, 300, 30), sku('margin', 900, 90, 10), sku('growth', 100, 30, 30), sku('risk', 800, -10, -1), sku('returns', 200, 20, 10, 25)])
    const assigned = board.groups.flatMap(group => group.items.map(item => item.sku))
    expect(assigned.sort()).toEqual(['growth', 'margin', 'returns', 'risk', 'star'])
    expect(board.groups.find(group => group.id === 'STAR')?.items.map(item => item.sku)).toContain('star')
    expect(board.groups.find(group => group.id === 'MARGIN_PRESSURE')?.items.map(item => item.sku)).toContain('margin')
    expect(board.groups.find(group => group.id === 'GROWTH')?.items.map(item => item.sku)).toContain('growth')
    expect(board.groups.find(group => group.id === 'HIGH_RISK')?.items.map(item => item.sku)).toEqual(expect.arrayContaining(['risk', 'returns']))
  })

  it('reports sales and positive-profit concentration without treating losses as generated profit', () => {
    const result = buildPortfolioConcentration([sku('a', 80, 60, 75), sku('b', 20, 40, 50), sku('loss', 0, -50, 0)])
    expect(result.topFiveSalesShare).toBe(100)
    expect(result.skusForEightyPercentSales).toBe(1)
    expect(result.skusForEightyPercentProfit).toBe(2)
    expect(result.salesContributors).toEqual([{ sku: 'a', value: 80, contributionPercent: 80, cumulativePercent: 80 }])
    expect(result.profitContributors.map(item => item.sku)).toEqual(['a', 'b'])
  })
})
