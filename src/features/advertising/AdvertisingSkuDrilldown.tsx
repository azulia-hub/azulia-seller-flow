import type { SponsoredProductsAttribution } from '../../core/advertising/sponsoredProducts'
import type { SkuProfitSummary } from '../../core/analytics/orderProfit'
import { SkuWorkspace } from '../../components/SkuWorkspace'

type Props = { sponsored: SponsoredProductsAttribution; product: SkuProfitSummary; formatMoney: (value: number) => string; onClose: () => void }

export function AdvertisingSkuDrilldown({ sponsored, product, formatMoney, onClose }: Props) {
  return <div className="drilldown-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="order-drilldown sku-mode ad-sku-drilldown unified-sku-dialog" role="dialog" aria-modal="true" aria-label="Product analysis">
      <header className="drilldown-head"><div><small>Product analysis</small><h2>{product.sku}</h2><p>{sponsored.selectedFrom} → {sponsored.selectedTo} · Transactions by posting date · {product.orders.length} linked orders</p></div><button className="close" aria-label="Close" onClick={onClose}>×</button></header>
      <SkuWorkspace key={product.sku} product={product} financialBasis="Transactions by posting date" advertisingProduct={product} sponsored={sponsored} initialTab="ADVERTISING" formatMoney={formatMoney} />
    </section>
  </div>
}
