import { ContentSection } from './ContentSection'
import { useMemo } from 'react'
import type { SkuProfitSummary } from '../core/analytics/orderProfit'
import type { SponsoredProductsAttribution } from '../core/advertising/sponsoredProducts'
import { buildSkuWorkspace } from '../core/analytics/skuWorkspace'
import { SkuCommercialOverview } from './SkuCommercialOverview'
import { SkuAdvertisingPanel } from './SkuAdvertisingPanel'
import { SkuGeographyPanel } from './SkuGeographyPanel'
import { SkuOrderInvestigation } from './SkuOrderInvestigation'
type Props = { showSnapshot?: boolean; financialBasis?: string; product: SkuProfitSummary; previousProduct?: SkuProfitSummary; advertisingProduct?: SkuProfitSummary; sponsored: SponsoredProductsAttribution; formatMoney: (value: number) => string }
export function SkuWorkspace({ product, previousProduct, advertisingProduct, sponsored, financialBasis = 'Sales-period view', showSnapshot = true, formatMoney }: Props) {
  return <div className="sku-workspace sku-profile-workspace">
    {showSnapshot ? <section className="seller-product-snapshot" aria-label="Product sales and returns"><div className="section-label"><span>Sales &amp; returns</span><small>{financialBasis}</small></div><div className="sku-metric-grid">{[['Total product sales', formatMoney(product.grossSales)], ['Revenue after refunds', formatMoney(product.netProductRevenue)], ['Units sold', product.soldQuantity.toLocaleString('en-IN')], ['Returned units', product.returnQuantity.toLocaleString('en-IN')]].map(([label, value]) => <article className="sku-mini-metric" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div></section> : null}
    <div id="product-advertising"><SkuAdvertisingPanel product={advertisingProduct} sku={product.sku} sponsored={sponsored} /></div>
    <ContentSection id="product-costs" title="Costs & returns"><CommercialDetails product={product} formatMoney={formatMoney} /></ContentSection>
    <section id="product-orders" className="seller-product-orders"><div className="section-label"><span>Orders</span><small>{financialBasis} · Reported product ad spend is not allocated to orders</small></div><SkuOrderInvestigation product={product} previousProduct={previousProduct} formatMoney={formatMoney} /></section>
    <ContentSection id="product-locations" title="Customer locations"><SkuGeographyPanel product={product} formatMoney={formatMoney} /></ContentSection>
  </div>
}

function CommercialDetails({ product, formatMoney }: { product: SkuProfitSummary; formatMoney: (value: number) => string }) {
  const workspace = useMemo(() => buildSkuWorkspace(product), [product])
  return <SkuCommercialOverview product={product} workspace={workspace} showBookedAdvertising={false} formatMoney={formatMoney} />
}
