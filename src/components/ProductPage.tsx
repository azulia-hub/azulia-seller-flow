import { useLayoutEffect, useMemo, useRef } from 'react'
import type { SkuProfitSummary } from '../core/analytics/orderProfit'
import { buildSkuAdvertisingEconomics, type SponsoredProductsAttribution } from '../core/advertising/sponsoredProducts'
import { ProductCostEditor } from './ProductCostEditor'
import { SkuWorkspace } from './SkuWorkspace'
import { SkuTrendChart } from './SkuTrendChart'
import { ProductThumbnail } from './ProductThumbnail'
import { compareProductPerformance, productPerformanceFigures, type HistoryCoverage } from '../core/analytics/productPerformance'
import type { DateRange } from '../core/analytics/timePeriods'
import { ProductComparison } from './ProductComparison'
import { productImage } from '../core/search/productTitles'

export function ProductPage({ product, advertisingProduct, sponsored, title, basis, backLabel, formatMoney, onBack, onViewInventory, previousProduct, comparisonCoverage = 'UNVERIFIED', comparisonRange,comparisonAsOf }: {
  comparisonAsOf?:string;
  onViewInventory?: () => void;
  previousProduct?: SkuProfitSummary; comparisonCoverage?: HistoryCoverage; comparisonRange?: DateRange;
  product: SkuProfitSummary; advertisingProduct?: SkuProfitSummary; sponsored: SponsoredProductsAttribution;
  title?: string; basis: string; backLabel: string; formatMoney: (value: number) => string; onBack: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useLayoutEffect(() => { heading.current?.focus({ preventScroll: true }) }, [product.sku])
  const ads = sponsored.skus.find(item => item.sku === product.sku)
  const economics = useMemo(() => ads && advertisingProduct ? buildSkuAdvertisingEconomics(advertisingProduct, ads) : null, [ads, advertisingProduct])
  const result = ads ? economics?.contributionAfterReportedAds ?? null : product.missingCost ? null : product.profitBeforeAds
  const imageUrl = useMemo(() => productImage(product.orders.flatMap(order => order.events).filter(event => event.sku === product.sku)), [product])

  const figures = useMemo(() => productPerformanceFigures(product), [product])
  const comparison = useMemo(() => compareProductPerformance(product, previousProduct, comparisonCoverage), [product, previousProduct, comparisonCoverage])

  return <section className="product-page" aria-label="Product profile">
    <button className="product-page-back text-btn" onClick={onBack}>← Back to {backLabel}</button>
    <header className="product-page-header">
      <div className="product-page-identity" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <ProductThumbnail url={imageUrl} />
        <div>
          <span className="eyebrow">Product overview</span>
          <h1 ref={heading} tabIndex={-1}>{title || product.sku}</h1>
          <p>{product.sku} · {basis}</p>
        </div>
      </div>
      <ProductCostEditor sku={product.sku} missingCost={product.missingCost || Boolean(advertisingProduct?.missingCost)} />
    </header>
    <nav className="product-section-nav" aria-label="Product sections">{[['product-advertising','Advertising'],['product-costs','Costs & returns'],['product-orders','Orders'],['product-locations','Locations']].map(([id,label]) => <button className="text-btn" key={id} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'start' })}>{label}</button>)}{onViewInventory?<button className="text-btn" onClick={onViewInventory}>Inventory & restock</button>:null}</nav>
    {comparisonRange ? <p className="product-comparison-basis">Period comparison · {comparisonAsOf?`Current data through ${new Date(comparisonAsOf).toLocaleString('en-IN')}. `:''}Compared with {comparisonRange.from} – {comparisonRange.to} · {comparisonCoverage === 'DOWNLOADED' ? 'Date windows downloaded; later order activity can update either period.' : 'Previous-period history incomplete or unverified; changes are hidden.'}</p> : null}
    <section className="product-page-metrics" aria-label="Product performance summary">
      <article><span>Total product sales</span><strong>{formatMoney(product.grossSales)}</strong><small>{product.soldQuantity.toLocaleString('en-IN')} units sold</small>{comparisonRange ? <ProductComparison change={comparison.sales} formatValue={formatMoney}/> : null}</article>
      <article><span>Net Amazon proceeds</span><strong>{formatMoney(figures.proceeds)}</strong><small>After refunds and net marketplace/shipping fees, plus reimbursements. Before costs and ads; not a bank deposit.</small>{comparisonRange ? <ProductComparison change={comparison.proceeds} formatValue={formatMoney}/> : null}</article>
      <article><span>{ads ? 'Profit after ads' : 'Profit before ads'}</span><strong className={result !== null && result < 0 ? 'bad-text' : ''}>{result === null ? '—' : formatMoney(result)}</strong><small>{result === null ? 'Add cost for the applicable periods' : ads ? 'After reported ads · excludes ad GST and account expenses' : 'Before unassigned advertising and account expenses'}</small>{!ads && comparisonRange ? <ProductComparison change={comparison.profit} formatValue={formatMoney}/> : null}</article>
      <article><span>Return rate</span><strong>{product.returnRate.toFixed(1)}%</strong><small>{product.returnQuantity.toLocaleString('en-IN')} units returned</small>{comparisonRange ? <ProductComparison change={comparison.returnRate} formatValue={value=>`${value}%`}/> : null}</article>
      <article><span>Net product cost</span><strong>{product.missingCost ? '—' : formatMoney(product.netCogs)}</strong><small>Current calculation reverses cost on refund; sellable recovery is not verified</small></article>
    </section>
    <section className="product-page-trend"><SkuTrendChart data={product.trend} formatMoney={formatMoney} /></section>
    <SkuWorkspace previousProduct={comparisonRange ? previousProduct : undefined} product={product} advertisingProduct={advertisingProduct} sponsored={sponsored} financialBasis={basis} showSnapshot={false} formatMoney={formatMoney} />
  </section>
}
