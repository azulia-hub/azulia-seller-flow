export type RawValue = string | number | boolean | null

export type RawRow = Readonly<Record<string, RawValue>>

export interface RawDataset {
  readonly id: string
  readonly name: string
  readonly headers: readonly string[]
  readonly rows: readonly RawRow[]
  readonly metadata?: Readonly<Record<string, string>>
}

export type CanonicalEventKind =
  | 'SALE'
  | 'REFUND'
  | 'FEE'
  | 'REIMBURSEMENT'
  | 'TAX'
  | 'SETTLEMENT'
  | 'OTHER'
  | 'UNKNOWN'

export type AmountClass = 'OPERATING' | 'SETTLEMENT'
export type ReturnType = 'RTO' | 'CUSTOMER_RETURN' | 'UNKNOWN'

export type AmountType =
  | 'PRODUCT_REVENUE'
  | 'SHIPPING_REVENUE'
  | 'GIFT_WRAP_REVENUE'
  | 'PROMOTION'
  | 'TAX'
  | 'COMMISSION'
  | 'FULFILLMENT_FEE'
  | 'SHIPPING_FEE'
  | 'ADVERTISING_FEE'
  | 'OTHER_FEE'
  | 'OTHER'
  | 'UNKNOWN'

export interface CanonicalFinancialEvent {
  readonly id: string
  readonly source: string
  readonly sourceDatasetId: string
  readonly sourceRow: number
  readonly date: string | null
  readonly orderId: string | null
  readonly sku: string | null
  readonly event: CanonicalEventKind
  readonly quantity: number | null
  readonly amount: number
  readonly amountClass: AmountClass
  readonly amountType: AmountType
  readonly state: string | null
  readonly city: string | null
  readonly accountType?: string | null
  readonly fulfillmentType?: string | null
  readonly status: string | null
  readonly rawType: string
  readonly rawDescription: string | null
  readonly classified: boolean
  readonly returnType?: ReturnType
  readonly returnEvidence?: string
  readonly raw: RawRow
}

export interface FinancialReconciliation {
  readonly supported: boolean
  readonly sourceTotal: number | null
  readonly normalizedTotal: number
  readonly difference: number | null
  readonly reconciled: boolean
}

export interface DataQualitySummary {
  readonly source: string
  readonly sourceRowCount: number
  readonly normalizedEventCount: number
  readonly unknownTransactionTypes: readonly string[]
  readonly unclassifiedEventCount: number
  readonly missingKeys: Readonly<{ orderId: number; sku: number; date: number }>
  readonly reconciliation: FinancialReconciliation
}

export interface CanonicalDataset {
  readonly source: string
  readonly events: readonly CanonicalFinancialEvent[]
  readonly quality: DataQualitySummary
}
