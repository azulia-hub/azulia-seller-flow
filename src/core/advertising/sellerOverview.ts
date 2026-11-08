import { productTitles, productImage } from '../search/productTitles'
import type { SponsoredProductsAttribution, SponsoredSkuAttribution } from './sponsoredProducts'
import { buildSkuAdvertisingEconomics } from './sponsoredProducts'
import type { SkuProfitSummary } from '../analytics/orderProfit'

export function buildSellerAdvertisingOverview(report: SponsoredProductsAttribution, postedGrossSales: number) {
  return {
    ...report.performance,
    tacos: report.status === 'AVAILABLE' && postedGrossSales > 0 ? report.performance.spend / postedGrossSales * 100 : null,
  }
}

export function buildSellerProductOverview(product: SkuProfitSummary, postedProduct: SkuProfitSummary | undefined, report: SponsoredProductsAttribution, advertisingBySku?: ReadonlyMap<string,SponsoredSkuAttribution>) {
  const matchingPostedProduct = postedProduct?.sku === product.sku ? postedProduct : undefined
  const advertising = report.status === 'AVAILABLE' ? (advertisingBySku ? advertisingBySku.get(product.sku) : report.skus.find(row => row.sku === product.sku)) : undefined
  const economics = advertising && matchingPostedProduct ? buildSkuAdvertisingEconomics(matchingPostedProduct, advertising) : null
  const displayedProduct = report.status === 'AVAILABLE' && matchingPostedProduct ? matchingPostedProduct : product
  const name = productTitles(displayedProduct.orders.flatMap(order => order.events).filter(event => event.sku === product.sku))[0]
  return { sku: product.sku, imageUrl: productImage(displayedProduct.orders.flatMap(order => order.events).filter(event => event.sku === product.sku)), name: name && name !== product.sku ? name : null, product: displayedProduct, advertising, economics,
    contribution: displayedProduct.missingCost || matchingPostedProduct?.missingCost ? null : economics?.contributionAfterReportedAds ?? null,
    contributionStatus: !advertising ? 'NO_ADS_EVIDENCE' as const : !matchingPostedProduct ? 'NO_FINANCIAL_ACTIVITY' as const : !economics || displayedProduct.missingCost || matchingPostedProduct?.missingCost ? 'MISSING_COST' as const : 'AVAILABLE' as const,
  }
}
/** Index joins once for the entire product list, rather than scanning for every row. */
export function buildSellerProductOverviews(products:readonly SkuProfitSummary[], postedProducts:readonly SkuProfitSummary[], report:SponsoredProductsAttribution) {
  const posted = new Map(postedProducts.map(product => [product.sku,product]))
  const advertising = new Map(report.skus.map(product => [product.sku,product]))
  return products.map(product => buildSellerProductOverview(product,posted.get(product.sku),report,advertising))
}
export type SellerProductOverview = ReturnType<typeof buildSellerProductOverview>

export function selectSellerProducts(rows: readonly SellerProductOverview[], spec: { query: string; sort: 'SALES' | 'RESULT' | 'RETURNS'; status: 'ALL' | 'MISSING_COST' | 'LOSS'; advertising: boolean }) {
  const tokens = spec.query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const result = (row: SellerProductOverview) => spec.advertising ? row.contribution : row.product.missingCost ? null : row.product.profitBeforeAds
  return rows.filter(row => tokens.every(token => `${row.sku} ${row.name ?? ''}`.toLowerCase().includes(token))
    && (spec.status !== 'MISSING_COST' || row.product.missingCost)
    && (spec.status !== 'LOSS' || (result(row) !== null && result(row)! < 0)))
    .sort((a,b) => (spec.sort === 'SALES' ? b.product.grossSales - a.product.grossSales : spec.sort === 'RETURNS' ? b.product.returnRate - a.product.returnRate : (result(b) ?? -Infinity) - (result(a) ?? -Infinity)) || a.sku.localeCompare(b.sku))
}
