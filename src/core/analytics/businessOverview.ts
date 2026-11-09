import type { CanonicalFinancialEvent } from '../data/types'
import type { ProductCost } from '../costs/types'
import { calculateCosts, type MissingCostPolicy } from '../costs/calculateCosts'
import { summarizeDashboard } from './dashboardSummary'
import { calculateUnitEconomics } from './unitEconomics'

export function buildBusinessOverview(events: readonly CanonicalFinancialEvent[], costs: readonly ProductCost[], policy: MissingCostPolicy, normalizeSku?: (sku: string) => string, orderIds?: readonly string[]) {
  const summary = summarizeDashboard(events)
  const costStatus = calculateCosts(events, costs, policy, normalizeSku)
  const profitAfterAds = summary.operatingNet - costStatus.netCogs
  const profitBeforeAds = profitAfterAds + summary.adsSpend
  const profitMargin = summary.grossSales ? profitAfterAds / summary.grossSales * 100 : 0
  const roi = costStatus.netCogs ? profitAfterAds / costStatus.netCogs * 100 : 0
  const unitEconomics = calculateUnitEconomics({ grossSales: summary.grossSales, netDeliveredQuantity: summary.netDeliveredQuantity, profitAfterAds, adsSpend: summary.adsSpend, profitReady: costStatus.profitReady })
  const directOperating = summary.grossSales - summary.refundValue - summary.marketplaceCharges - summary.netEasyShipFee - summary.adsSpend + summary.reimbursements
  const adjustments = Math.round((summary.operatingNet - directOperating) * 100) / 100
  return { summary, costStatus, profitAfterAds, profitBeforeAds, profitMargin, roi, unitEconomics, otherOperating: adjustments,
    orderCount: new Set(orderIds ?? events.flatMap(event => event.orderId ? [event.orderId] : [])).size,
    financialRows: [
      { label: 'Customer sales (incl. tax)', value: summary.grossSales }, { label: 'Customer refunds', value: -summary.refundValue },
      { label: 'Marketplace charges', value: -summary.marketplaceCharges }, { label: 'Shipping fees', value: -summary.netEasyShipFee },
      { label: 'Booked advertising', value: -summary.adsSpend }, { label: 'Product costs', value: costStatus.profitReady ? -costStatus.netCogs : null },
      { label: 'Reimbursements', value: summary.reimbursements }, { label: 'Tax withholding & adjustments', value: adjustments },
    ],
  }
}
