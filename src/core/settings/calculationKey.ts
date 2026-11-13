import { preferences } from './preferences'
import type { DeviceSettings } from './deviceSettings'
export function calculationKey(settings:DeviceSettings):string {
  const config=preferences(settings.preferences)
  return JSON.stringify(['snapshot-v2',settings.costs,settings.rules,settings.missingCostPolicy,config.includeCustomerTax,config.estimateMissingPrices])
}
