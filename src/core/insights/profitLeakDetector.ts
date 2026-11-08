import type { CanonicalFinancialEvent } from '../data/types'
import type { ProductCost } from '../costs/types'
import type { MissingCostPolicy } from '../costs/calculateCosts'
import { calculateCosts } from '../costs/calculateCosts'
import { summarizeProducts } from '../analytics/dashboardSummary'

export type AnomalySeverity = 'CRITICAL' | 'WARNING' | 'INFO'

export interface ProfitLeakAlert {
  readonly id: string
  readonly sku: string
  readonly severity: AnomalySeverity
  readonly type: 'BLEEDING_SKU' | 'HIGH_RETURNS' | 'AD_OVERSPEND' | 'FEE_HIKE'
  readonly title: string
  readonly description: string
  readonly metricDelta: string
  readonly impactAmount: number
  readonly recommendation: string
}

export interface ProfitLeakInput {
  readonly events: readonly CanonicalFinancialEvent[]
  readonly costs: readonly ProductCost[]
  readonly missingCostPolicy: MissingCostPolicy
  readonly normalizeSku?: (sku: string) => string
}

export function detectProfitLeaks(input: ProfitLeakInput): ProfitLeakAlert[] {
  const alerts: ProfitLeakAlert[] = []
  const costStatus = calculateCosts(input.events, input.costs, input.missingCostPolicy, input.normalizeSku)
  const productSummaries = summarizeProducts(input.events)

  const cogsBySku = new Map<string, number>()
  for (const item of costStatus.appliedCosts) {
    cogsBySku.set(item.sku, (cogsBySku.get(item.sku) ?? 0) + item.cogs)
  }

  // Pre-index advertising and fees by SKU
  const adSpendBySku = new Map<string, number>()
  const feesBySku = new Map<string, number>()

  for (const event of input.events) {
    if (!event.sku) continue
    if (event.amountClass === 'OPERATING') {
      if (event.amountType === 'ADVERTISING_FEE') {
        adSpendBySku.set(event.sku, (adSpendBySku.get(event.sku) ?? 0) - event.amount)
      } else if (['COMMISSION', 'FULFILLMENT_FEE', 'SHIPPING_FEE', 'OTHER_FEE'].includes(event.amountType)) {
        feesBySku.set(event.sku, (feesBySku.get(event.sku) ?? 0) - event.amount)
      }
    }
  }

  for (const summary of productSummaries) {
    const sku = summary.sku
    const grossSales = summary.grossSales
    const cogs = cogsBySku.get(sku) ?? 0
    const adSpend = Math.round((adSpendBySku.get(sku) ?? 0) * 100) / 100
    const fees = Math.round((feesBySku.get(sku) ?? 0) * 100) / 100
    const netProfit = Math.round((summary.operatingNet - cogs) * 100) / 100
    const margin = grossSales > 0 ? (netProfit / grossSales) * 100 : 0
    const returnRate = summary.soldQuantity > 0 ? (summary.returnQuantity / summary.soldQuantity) * 100 : 0

    // 1. Bleeding SKU: Losing money after COGS, ads and fees
    if (netProfit < 0 && (grossSales > 0 || summary.soldQuantity > 0)) {
      alerts.push({
        id: `leak-bleed-${sku}`,
        sku,
        severity: 'CRITICAL',
        type: 'BLEEDING_SKU',
        title: `Bleeding product: ${sku}`,
        description: `Operating at a net loss of ₹${Math.abs(netProfit).toLocaleString('en-IN')} on sales of ₹${grossSales.toLocaleString('en-IN')} (margin: ${Math.round(margin)}%).`,
        metricDelta: `${Math.round(margin)}% margin`,
        impactAmount: Math.abs(netProfit),
        recommendation: 'Evaluate lowering ad spend bids, negotiating supplier costs, or raising list price.',
      })
    }

    // 2. High Return Rate: Returns > 15% and at least 3 returns
    if (summary.returnQuantity >= 3 && returnRate >= 15) {
      const estimatedRefundCost = Math.round(fees * (summary.returnQuantity / Math.max(1, summary.soldQuantity)))
      alerts.push({
        id: `leak-returns-${sku}`,
        sku,
        severity: returnRate >= 25 ? 'CRITICAL' : 'WARNING',
        type: 'HIGH_RETURNS',
        title: `Excessive returns: ${sku} (${Math.round(returnRate)}%)`,
        description: `${summary.returnQuantity} of ${summary.soldQuantity} units returned. High returns drain fulfillment and shipping charges.`,
        metricDelta: `${Math.round(returnRate)}% return rate`,
        impactAmount: estimatedRefundCost,
        recommendation: 'Audit customer return comments, check size chart / product photos, or inspect packaging protection.',
      })
    }

    // 3. Ad Spend Exceeding Margin (TACoS > Break-even TACoS)
    if (grossSales > 0 && adSpend > 0) {
      const tacos = (adSpend / grossSales) * 100
      const preAdProfit = netProfit + adSpend
      const breakEvenTacos = (preAdProfit / grossSales) * 100

      if (tacos > breakEvenTacos && preAdProfit > 0) {
        const excessAdSpend = Math.round(adSpend - (preAdProfit * 0.8))
        alerts.push({
          id: `leak-ads-${sku}`,
          sku,
          severity: 'WARNING',
          type: 'AD_OVERSPEND',
          title: `Advertising eating profit: ${sku}`,
          description: `TACoS is ${Math.round(tacos)}%, exceeding break-even margin of ${Math.round(breakEvenTacos)}%. Ad clicks are consuming more than product margin.`,
          metricDelta: `${Math.round(tacos)}% TACoS vs ${Math.round(breakEvenTacos)}% limit`,
          impactAmount: Math.max(0, excessAdSpend),
          recommendation: 'Lower top-of-search keyword bids and negate non-converting customer search terms.',
        })
      }
    }
  }

  // Sort by severity (CRITICAL first, then highest impact amount)
  const severityOrder: Record<AnomalySeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 }
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.impactAmount - a.impactAmount)
}
