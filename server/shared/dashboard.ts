import { applyClassificationRules } from '../../src/core/classification/classificationRules'
import { buildBusinessOverview } from '../../src/core/analytics/businessOverview'
import { computePulseScoreboard } from '../../src/core/analytics/pulseScoreboard'
import { indexOrderHistory, selectOrderCohort } from '../../src/core/analytics/orderLifecycle'
import { filterEvents } from '../../src/core/analytics/dashboardSummary'
import { normalizeAmazonSku } from '../../src/adapters/amazon/unifiedTransactionAdapter'
import type { CanonicalDataset } from '../../src/core/data/types'
import type { CalculationSettings } from '../../src/adapters/amazon-shared/contracts'
import type { SyncRange } from '../../src/core/sync/ranges'
export function calculateSharedDashboard(dataset: CanonicalDataset, settings:CalculationSettings, range:{from:string;to:string;fulfillment?:string}, purchaseCoverage:SyncRange[], today:string) {
  const effective = applyClassificationRules(dataset,settings.classificationRules)
  const events = filterEvents(effective.events,{fulfillmentType:range.fulfillment || undefined})
  const orders = effective.orders?.filter(order => !range.fulfillment || !order.fulfillmentType || order.fulfillmentType === range.fulfillment)
  const cohort = selectOrderCohort(indexOrderHistory(events,orders),range,'ALL_RECORDED')
  return {
    business:buildBusinessOverview(cohort.events,settings.costs,settings.missingCostPolicy,normalizeAmazonSku,cohort.orders.map(order => order.orderId)),
    pulse:computePulseScoreboard({events:effective.events,costs:settings.costs,missingCostPolicy:settings.missingCostPolicy,normalizeSku:normalizeAmazonSku,sourceOrders:effective.orders,anchorDate:today,purchaseCoverage,salesBasis:'ORDERED'}),
  }
}
