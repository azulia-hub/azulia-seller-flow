export interface ProductCost {
  readonly sku: string
  readonly unitCost: number
  readonly updatedAt: string
  /** Inclusive ISO date. Null/omitted records are the default fallback for all dates. */
  readonly effectiveFrom?: string | null
}
