import type { CanonicalFinancialEvent } from '../data/types'
import type { ProductCost } from '../costs/types'
import { calculateCosts, type MissingCostPolicy } from '../costs/calculateCosts'
import { summarizeDashboard } from './dashboardSummary'
import { calculateUnitEconomics } from './unitEconomics'

export function buildBusinessOverview(events: readonly CanonicalFinancialEvent[], costs: readonly ProductCost[], policy: MissingCostPolicy, normalizeSku?: (sku: string) => string) {
  const summary = summarizeDashboard(events)
  const costStatus = calculateCosts(events, costs, policy, normalizeSku)
  const profitAfterAds = summary.operatingNet - costStatus.netCogs
  const profitBeforeAds = profitAfterAds + summary.adsSpend
  const profitMargin = summary.grossSales ? profitAfterAds / summary.grossSales * 100 : 0
  const roi = costStatus.netCogs ? profitAfterAds / costStatus.netCogs * 100 : 0
  const unitEconomics = calculateUnitEconomics({ grossSales: summary.grossSales, netDeliveredQuantity: summary.netDeliveredQuantity, profitAfterAds, adsSpend: summary.adsSpend, profitReady: costStatus.profitReady })
  const explained = summary.grossSales - summary.refundValue - summary.marketplaceCharges - summary.netEasyShipFee - summary.adsSpend + summary.reimbursements + summary.taxNet
  return { summary, costStatus, profitAfterAds, profitBeforeAds, profitMargin, roi, unitEconomics, otherOperating: summary.operatingNet - explained,
    orderCount: new Set(events.flatMap(event => event.orderId ? [event.orderId] : [])).size,
    financialRows: [
      { label: 'Product sales', value: summary.grossSales }, { label: 'Product refunds', value: -summary.refundValue },
      { label: 'Marketplace charges', value: -summary.marketplaceCharges }, { label: 'Shipping fees', value: -summary.netEasyShipFee },
      { label: 'Booked advertising', value: -summary.adsSpend }, { label: 'Product costs', value: costStatus.profitReady ? -costStatus.netCogs : null },
      { label: 'Reimbursements', value: summary.reimbursements }, { label: 'Tax and other adjustments', value: summary.taxNet + summary.operatingNet - explained },
    ],
  }
}
