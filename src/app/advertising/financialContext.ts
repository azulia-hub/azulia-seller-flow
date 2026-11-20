import type { CanonicalFinancialEvent } from '../../core/data/types'
import type { ProductCost } from '../../core/costs/types'
import type { MissingCostPolicy } from '../../core/costs/calculateCosts'
import type { SyncRange } from '../../core/sync/ranges'
import { filterEvents } from '../../core/analytics/dashboardSummary'
import { summarizeProductProfitability } from '../../core/analytics/orderProfit'
import { financialProductsForAdvertising } from '../../core/advertising/workspaceFinancial'
import { missingRanges } from '../../core/sync/ranges'
import type { WorkspaceFinancialContext } from './buildWorkspaceModel'

/** Posting-period financial join: purchase cohorts must not substitute for these dates. */
export function advertisingFinancialContext(input: { events: readonly CanonicalFinancialEvent[]; costs: readonly ProductCost[]; policy: MissingCostPolicy; normalizeSku?: (value: string) => string; from: string; to: string; coverage?: readonly SyncRange[]; uploadedFrom?: string | null; uploadedTo?: string | null; compatible: boolean }): WorkspaceFinancialContext {
  const events = filterEvents(input.events, { fromDate: input.from, toDate: input.to })
  const products = summarizeProductProfitability(events, input.costs, input.policy, input.normalizeSku)
  const range = { from: new Date(Date.parse(`${input.from}T00:00:00Z`) - 330 * 60000).toISOString(), to: new Date(Date.parse(`${input.to}T00:00:00Z`) + 86400000 - 330 * 60000).toISOString() }
  const completeCoverage = input.coverage ? missingRanges(range, input.coverage).length === 0 : Boolean(input.uploadedFrom && input.uploadedTo && input.uploadedFrom <= input.from && input.uploadedTo >= input.to)
  return { products: financialProductsForAdvertising(events, products), completeCoverage, compatibleTaxBasis: input.compatible }
}
