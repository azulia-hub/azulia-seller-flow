import type { CanonicalDataset, CanonicalFinancialEvent } from '../data/types'
import type { MissingCostPolicy } from '../costs/calculateCosts'
import { calculateCosts } from '../costs/calculateCosts'
import type { ProductCost } from '../costs/types'
import { summarizeDashboard } from '../analytics/dashboardSummary'
import { summarizeOrders, summarizeProductProfitability } from '../analytics/orderProfit'
import { summarizeReturns } from '../analytics/returnSummary'
import { calculateUnitEconomics } from '../analytics/unitEconomics'

export type WorkbookCell = string | number | boolean | null
export interface WorkbookSheet { readonly name: string; readonly headers: readonly string[]; readonly rows: readonly (readonly WorkbookCell[])[] }
export interface AuditWorkbook { readonly fileStem: string; readonly sheets: readonly WorkbookSheet[] }

export interface AuditWorkbookSpec {
  readonly dataset: CanonicalDataset
  readonly events: readonly CanonicalFinancialEvent[]
  readonly costs: readonly ProductCost[]
  readonly missingCostPolicy: MissingCostPolicy
  readonly fileName: string
  readonly fromDate?: string
  readonly toDate?: string
  readonly fulfillmentType?: string
  readonly normalizeSku?: (sku: string) => string
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const sum = (events: readonly CanonicalFinancialEvent[]) => round(events.reduce((total, event) => total + event.amount, 0))

export function buildAuditWorkbook(spec: AuditWorkbookSpec): AuditWorkbook {
  const { dataset, events, costs, missingCostPolicy, normalizeSku } = spec
  const summary = summarizeDashboard(events)
  const cost = calculateCosts(events, costs, missingCostPolicy, normalizeSku)
  const orders = summarizeOrders(events, costs, missingCostPolicy, normalizeSku)
  const products = summarizeProductProfitability(events, costs, missingCostPolicy, normalizeSku)
  const returns = summarizeReturns(events, costs, normalizeSku)
  const profitAfterAds = round(summary.operatingNet - cost.netCogs)
  const profitBeforeAds = round(profitAfterAds + summary.adsSpend)
  const units = calculateUnitEconomics({ grossSales: summary.grossSales, netDeliveredQuantity: summary.netDeliveredQuantity, profitAfterAds, adsSpend: summary.adsSpend, profitReady: cost.profitReady })
  const operatingEvents = events.filter(event => event.amountClass === 'OPERATING')
  const settlementEvents = events.filter(event => event.amountClass === 'SETTLEMENT')
  const unclassified = events.filter(event => !event.classified)
  const feeEvents = events.filter(event => event.amountClass === 'OPERATING' && (event.event === 'FEE' || event.amountType.endsWith('_FEE') || event.amountType === 'COMMISSION'))
  const selectionTotal = sum(events)
  const operatingTotal = sum(operatingEvents)
  const settlementTotal = sum(settlementEvents)

  const sheets: WorkbookSheet[] = [
    { name: 'Read me', headers: ['Field', 'Value'], rows: [
      ['Report', spec.fileName], ['Source adapter', dataset.source], ['Selected from', spec.fromDate ?? 'All available dates'], ['Selected to', spec.toDate ?? 'All available dates'], ['Fulfillment filter', spec.fulfillmentType ?? 'All'], ['Selected canonical events', events.length], ['Cost policy', missingCostPolicy],
      ['Important', 'Source reconciliation applies to the complete imported report. Selected-period totals are canonical event totals after active filters.'],
      ['Profit rule', 'Operating net excludes settlement transfers. Returned resellable units reverse COGS.'],
    ] },
    { name: 'Summary', headers: ['Metric', 'Value', 'Status or formula'], rows: [
      ['Gross sales', summary.grossSales, 'Positive product sales'], ['Net product revenue', summary.netProductRevenue, 'Sales plus refunds'], ['Sold quantity', summary.soldQuantity, ''], ['Return quantity', summary.returnQuantity, ''], ['Net delivered quantity', summary.netDeliveredQuantity, 'Sold less returned'], ['Return rate %', round(summary.returnRate), 'Returned / sold'],
      ['Operating net', summary.operatingNet, 'All operating canonical events; includes tax'], ['Marketplace charges', summary.marketplaceCharges, 'Excludes shipping and advertising'], ['Net shipping fee', summary.netEasyShipFee, 'Charges less reversals'], ['Advertising spend', summary.adsSpend, ''], ['Reimbursements', summary.reimbursements, ''], ['Tax included', summary.taxNet, 'Included as income/operating value'], ['Net COGS', cost.netCogs, cost.complete ? 'Complete costs' : `${cost.missingSkus.length} missing SKU costs`],
      ['Profit before ads', cost.profitReady ? profitBeforeAds : null, cost.profitReady ? 'Profit after ads plus ad spend' : 'Unavailable: missing costs'], ['Profit after ads', cost.profitReady ? profitAfterAds : null, cost.profitReady ? 'Operating net less net COGS' : 'Unavailable: missing costs'], ['Profit margin %', cost.profitReady && summary.grossSales ? round(profitAfterAds / summary.grossSales * 100) : null, 'Profit after ads / gross sales'], ['TACOS %', round(summary.tacos), 'Ad spend / gross sales'], ['ROAS', round(summary.roas), 'Gross sales / ad spend'], ['Profit per delivered unit', units.profitPerDeliveredUnit, 'Profit after ads / net delivered quantity'], ['Break-even TACOS %', units.breakEvenTacos, 'Non-negative profit before ads / gross sales'], ['Cost coverage %', round(cost.coveragePercent), cost.complete ? 'Complete' : 'Incomplete'],
    ] },
    { name: 'SKUs', headers: ['SKU','Gross sales','Net product revenue','Sold','Returned','RTO','Customer return','Unknown return','Net delivered','Return rate %','Marketplace charges','Net shipping','Direct ads','Reimbursements','Tax','Operating net','Net COGS','Profit before ads','Profit after ads','Margin %','ROI %','Profit per delivered unit','Break-even TACOS %','Cost status'], rows: products.map(item => [item.sku,item.grossSales,item.netProductRevenue,item.soldQuantity,item.returnQuantity,item.rtoQuantity,item.customerReturnQuantity,item.unknownReturnQuantity,item.netDeliveredQuantity,item.returnRate,item.marketplaceCharges,item.shippingFees,item.advertising,item.reimbursements,item.tax,item.operatingNet,item.netCogs,item.profitBeforeAds,item.profit,item.profitMargin,item.roi,item.netDeliveredQuantity > 0 && !item.missingCost ? item.profitPerDeliveredUnit : null,item.grossSales > 0 && !item.missingCost ? item.breakEvenTacos : null,item.missingCost ? 'Missing' : 'Covered']) },
    { name: 'Orders', headers: ['Order ID','Date','SKUs','State','City','Payment type','Fulfillment','Status','Gross sales','Sold','Returned','Refunds','Commission','Other marketplace charges','Gross shipping fees','Shipping reversals','Net shipping','Advertising','Reimbursements','Tax','Other operating','Operating net','Net COGS','Profit','Profit per delivered unit','Break-even TACOS %','Return type','Return evidence','Cost status','Missing SKUs'], rows: orders.map(order => [order.orderId,order.date,order.skus.join(', '),order.state,order.city,order.accountType,order.fulfillmentType,order.status,order.grossSales,order.soldQuantity,order.returnQuantity,order.refunds,order.commissionCharges,order.otherMarketplaceCharges,order.grossShippingFees,order.shippingFeeReversals,order.shippingFees,order.advertising,order.reimbursements,order.tax,order.otherOperating,order.operatingNet,order.netCogs,order.profit,order.profitPerDeliveredUnit,order.breakEvenTacos,order.returnType,order.returnEvidence,order.profitReady ? 'Ready' : 'Incomplete',order.missingSkus.join(', ')]) },
    { name: 'Returns', headers: ['Order ID','Date','SKU','State','City','Type','Quantity','Refund value','Net shipping','Marketplace charges','COGS recovered','Reimbursements','Return loss','Evidence','Cost status'], rows: returns.orders.map(order => [order.orderId,order.date,order.sku,order.state,order.city,order.type,order.quantity,order.refundValue,order.netShipping,order.marketplaceCharges,order.cogsRecovered,order.reimbursements,order.returnLossAfterReimbursement,order.evidence,order.missingCost ? 'Missing' : 'Covered']) },
    { name: 'Fees', headers: ['Date','Order ID','SKU','Event','Amount type','Signed amount','State','City','Payment type','Fulfillment','Raw type','Description','Classified'], rows: feeEvents.map(event => [event.date,event.orderId,event.sku,event.event,event.amountType,event.amount,event.state,event.city,event.accountType ?? null,event.fulfillmentType ?? null,event.rawType,event.rawDescription,event.classified]) },
    { name: 'Reconciliation', headers: ['Check','Scope','Expected','Actual','Difference','Result','Explanation'], rows: [
      ['Source to normalized','Complete imported report',dataset.quality.reconciliation.sourceTotal,dataset.quality.reconciliation.normalizedTotal,dataset.quality.reconciliation.difference,dataset.quality.reconciliation.supported ? (dataset.quality.reconciliation.reconciled ? 'Matched' : 'Review') : 'Not supported','Provided by normalization reconciliation'],
      ['Selected canonical partition','Active filters',selectionTotal,round(operatingTotal + settlementTotal),round(selectionTotal - operatingTotal - settlementTotal),round(selectionTotal - operatingTotal - settlementTotal) === 0 ? 'Matched' : 'Review','Selected total equals operating plus settlement events'],
      ['Operating profit boundary','Active filters',operatingTotal,summary.operatingNet,round(operatingTotal - summary.operatingNet),round(operatingTotal - summary.operatingNet) === 0 ? 'Matched' : 'Review','Settlement transfers excluded from operating net'],
      ['Settlement disclosure','Active filters',settlementTotal,settlementTotal,0,'Disclosed','Tracked separately and excluded from profit'],
      ['Cost coverage','Active filters',cost.requiredSkus.length,cost.coveredSkus,cost.missingSkus.length,cost.complete ? 'Complete' : 'Incomplete',cost.missingSkus.join(', ') || 'All required SKUs covered'],
      ['Unclassified events','Active filters',0,unclassified.length,sum(unclassified),unclassified.length ? 'Review' : 'Clear','Unknown events remain present in the export'],
    ] },
    { name: 'Unclassified', headers: ['Date','Order ID','SKU','Event','Amount class','Amount type','Signed amount','Raw type','Description','Source row'], rows: unclassified.map(event => [event.date,event.orderId,event.sku,event.event,event.amountClass,event.amountType,event.amount,event.rawType,event.rawDescription,event.sourceRow]) },
  ]
  return { fileStem: spec.fileName.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-'), sheets }
}
