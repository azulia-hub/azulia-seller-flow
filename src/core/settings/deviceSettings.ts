import type { ProductCost } from '../costs/types'
import type { ClassificationRule } from '../classification/types'
import type { MissingCostPolicy } from '../costs/calculateCosts'
import type { AppPreferences } from './preferences'
export interface DeviceSettings { costs:ProductCost[];rules:ClassificationRule[];missingCostPolicy:MissingCostPolicy;preferences?:AppPreferences }
