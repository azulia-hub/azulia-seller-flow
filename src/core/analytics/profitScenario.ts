import type { SkuProfitSummary } from './orderProfit'

export function profitScenarioBaseline(product: SkuProfitSummary, adSpend: number | null) {
  const units = product.soldQuantity
  if (product.missingCost || units <= 0 || product.grossSales <= 0 ||
      product.returnQuantity < 0 || product.returnQuantity > units) return null
  const saleIds = new Set(product.orders.flatMap(order => order.events
    .filter(event => event.sku === product.sku && event.event === 'SALE')
    .map(event => event.id)))
  const saleCosts = product.orders.flatMap(order => order.costApplications ?? [])
    .filter(cost => saleIds.has(cost.eventId))
  const coveredUnits = saleCosts.reduce((sum, cost) => sum + cost.quantity, 0)
  if (coveredUnits !== units) return null
  const grossCogs = saleCosts.reduce((sum, cost) => sum + cost.cogs, 0)
  const unitCost = grossCogs / units
  if (!Number.isFinite(unitCost) || unitCost < 0) return null
  const price = product.grossSales / units
  const returnRate = product.returnQuantity / units
  const recoveryPerReturn = product.returnQuantity ? (grossCogs - product.netCogs) / product.returnQuantity : 0
  const refundShare = product.returnQuantity
    ? (product.customerRefunds ?? product.orders.reduce((sum, order) => sum + order.refunds, 0)) /
      (product.returnQuantity * price)
    : 1
  const contribution = product.profitBeforeAds - (adSpend ?? 0)
  const otherPerUnit = (product.profitBeforeAds - product.grossSales +
    price * refundShare * product.returnQuantity + product.netCogs) / units
  return { units, price, unitCost, returnRate, adSpend, contribution, otherPerUnit, recoveryPerReturn, refundShare }
}

export type ScenarioBaseline = NonNullable<ReturnType<typeof profitScenarioBaseline>>

export function calculateProfitScenario(baseline: ScenarioBaseline, spec: {
  price: number; unitCost: number; returnRate: number; adSpend: number; units: number
}) {
  const { price, unitCost, returnRate, adSpend, units } = spec
  if (!Object.values(spec).every(value => Number.isFinite(value) && value >= 0) ||
      !Number.isSafeInteger(units) || units === 0 || returnRate > 1) return null
  const retainedShare = 1 - returnRate * baseline.refundShare
  const recovery = baseline.unitCost > 0 ? baseline.recoveryPerReturn * unitCost / baseline.unitCost : baseline.recoveryPerReturn
  const costsPerUnit = unitCost - returnRate * recovery - baseline.otherPerUnit
  const beforeAdsPerUnit = price * retainedShare - costsPerUnit
  const contribution = beforeAdsPerUnit * units - adSpend
  if (!Number.isFinite(contribution)) return null
  const required = Math.ceil((baseline.contribution + adSpend) / beforeAdsPerUnit - 1e-9)
  return {
    contribution,
    perUnit: contribution / units,
    breakEvenPrice: retainedShare > 0 ? Math.max(0, Math.ceil((costsPerUnit + adSpend / units) / retainedShare * 100 - 1e-8) / 100) : null,
    unitsToMatch: baseline.contribution > 0 && beforeAdsPerUnit > 0 && Number.isSafeInteger(required) ? required : null,
  }
}
