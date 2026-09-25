export interface SponsoredProductRow {
  readonly date: string
  readonly portfolio: string
  readonly campaign: string
  readonly adGroup: string
  readonly advertisedSku: string
  readonly advertisedAsin: string
  readonly impressions: number
  readonly clicks: number
  readonly spendExcludingTax: number
  readonly attributedSales: number
  readonly advertisedSkuSales: number
  readonly otherSkuSales: number
  readonly orders: number
  readonly units: number
}

export interface SponsoredProductsReport {
  readonly id: string
  readonly fileName: string
  readonly importedAt: string
  readonly minDate: string
  readonly maxDate: string
  readonly rows: readonly SponsoredProductRow[]
}

