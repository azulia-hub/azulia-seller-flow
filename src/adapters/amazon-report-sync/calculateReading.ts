import { toUnifiedReport } from './toUnifiedReport'
import { profileDataset } from '../../core/imports/importHistory'
import { computePulseScoreboard } from '../../core/analytics/pulseScoreboard'
import { applyClassificationRules } from '../../core/classification/classificationRules'
import { normalizeAmazonSku } from '../amazon/unifiedTransactionAdapter'
import { preferences } from '../../core/settings/preferences'
import type { DeviceSettings } from '../../core/settings/deviceSettings'
import type { AutomaticReading } from './readingStore'
import type { SyncSnapshot } from './protocol'
export { calculationKey } from '../../core/settings/calculationKey'
import { calculationKey } from '../../core/settings/calculationKey'
/** Shared by the Android background runtime and desktop worker. No UI/storage dependencies. */
export function calculateReading(snapshot:SyncSnapshot,settings:DeviceSettings,at=new Date().toISOString()):AutomaticReading {
  if(snapshot.delta)throw new Error('A completed reading requires a complete matching source snapshot.')
  const result=toUnifiedReport(snapshot),config=preferences(settings.preferences)
  const effective=applyClassificationRules(result.dataset,settings.rules)
  const scoreboard=computePulseScoreboard({events:effective.events,costs:settings.costs,missingCostPolicy:settings.missingCostPolicy,normalizeSku:normalizeAmazonSku,sourceOrders:effective.orders,purchaseCoverage:snapshot.purchaseCoverage,anchorDate:new Date(Date.parse(at)+330*60000).toISOString().slice(0,10),includeCustomerTax:config.includeCustomerTax,estimateMissingPrices:config.estimateMissingPrices})
  return {id:`api:${snapshot.connectionKey}`,fileName:'Amazon activity · automatic',importedAt:at,profile:profileDataset(result.dataset),deliveryVersion:15,connectionKey:snapshot.connectionKey,revision:snapshot.revision,sourceRecords:snapshot.records,sourceOrders:snapshot.orders??[],...result,precomputed:{key:calculationKey(settings),scoreboard}}
}

export { syncInventory } from '../amazon-inventory/syncInventory'
export { createInventoryReader } from '../amazon-inventory/reader'
