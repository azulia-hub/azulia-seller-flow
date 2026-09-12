import type { AmountClass, AmountType, CanonicalEventKind } from '../data/types'

export interface CanonicalFieldMapping {
  readonly date?: string
  readonly orderId?: string
  readonly sku?: string
  readonly quantity?: string
  readonly state?: string
  readonly city?: string
  readonly accountType?: string
  readonly fulfillmentType?: string
  readonly status?: string
  readonly rawType?: string
  readonly description?: string
}

export interface AmountMapping {
  readonly column: string
  readonly amountType: AmountType
  readonly event: CanonicalEventKind
  readonly amountClass?: AmountClass
  readonly when?: Readonly<{
    column: string
    operator: 'equals' | 'contains'
    value: string
  }>
}

export interface TypeMapping {
  readonly value: string
  readonly event: CanonicalEventKind
  readonly amountClass?: AmountClass
}

export interface MappingSpec {
  readonly id: string
  readonly source: string
  readonly fields: CanonicalFieldMapping
  readonly amounts: readonly AmountMapping[]
  readonly types?: readonly TypeMapping[]
  readonly totalColumn?: string
  readonly fieldTransforms?: readonly Readonly<{
    field: keyof CanonicalFieldMapping
    operation: 'stripSuffix'
    value: string
  }>[]
}
