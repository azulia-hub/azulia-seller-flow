import type { AmountClass, AmountType, CanonicalEventKind } from '../data/types'

export interface ClassificationRule {
  readonly id: string
  readonly source: string
  readonly rawType: string
  readonly event: CanonicalEventKind
  readonly amountClass: AmountClass
  readonly amountType?: AmountType
  readonly createdAt: string
}

export interface UnclassifiedEventGroup {
  readonly key: string
  readonly source: string
  readonly rawType: string
  readonly count: number
  readonly amount: number
  readonly descriptions: readonly string[]
  readonly orderIds: readonly string[]
  readonly amountTypes: readonly AmountType[]
}

export interface UnclassifiedEventSummary {
  readonly groups: readonly UnclassifiedEventGroup[]
  readonly labelCount: number
  readonly eventCount: number
  readonly amount: number
}
