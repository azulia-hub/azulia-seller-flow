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
  readonly sourceTransactionId?: string | null
  readonly descriptionIsProductTitle?: boolean
  readonly sourceRow: number
  readonly date: string | null
  /** Original order date. Undefined retains legacy file inference; null means explicitly unknown. */
  readonly orderPurchaseDate?: string | null
  /** Source identifies this as order activity, even if its order identity is unavailable. */
  readonly orderOriginRequired?: boolean
  /** Adapter already resolved explicit source replacement identities. */
  readonly sourceIdentityResolved?: boolean
  readonly releaseState?: 'RELEASED' | 'PENDING' | 'UNKNOWN'
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

/** Order identity/status is independent of financial recognition. No synthetic money events. */
export interface CanonicalOrderItem {
  readonly asin?: string | null
  readonly sku?: string | null
  readonly title?: string | null
  readonly imageUrl?: string | null
  readonly quantity?: number | null
}

export interface CanonicalOrder {
  readonly orderId: string
  readonly purchaseDate: string
  readonly status: string | null
  readonly fulfillmentType: string | null
  /** Source-reported order total, which may include tax/shipping; never product revenue. */
  readonly orderValue: string | null
  readonly currency: string | null
  readonly sku?: string | null
  readonly asin?: string | null
  readonly title?: string | null
  readonly imageUrl?: string | null
  readonly items?: readonly CanonicalOrderItem[]
}

export interface CanonicalDataset {
  readonly orders?: readonly CanonicalOrder[]
  readonly source: string
  readonly events: readonly CanonicalFinancialEvent[]
  readonly quality: DataQualitySummary
}
