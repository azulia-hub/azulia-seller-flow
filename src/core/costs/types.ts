export interface LandedCostBreakdown {
  readonly purchaseCost?: number | null
  readonly packagingCost?: number | null
  readonly freightCost?: number | null
  readonly taxCreditOffset?: number | null
}

export interface ProductCost extends LandedCostBreakdown {
  readonly sku: string
  readonly unitCost: number
  readonly updatedAt: string
  /** Inclusive ISO date. Null/omitted records are the default fallback for all dates. */
  readonly effectiveFrom?: string | null
}
