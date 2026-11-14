import { ProductThumbnail } from '../../components/ProductThumbnail'
import React, { useMemo, useState, useEffect } from 'react'
import type {
  CanonicalInventoryItem,
  ReplenishmentRecommendation,
  ReplenishmentUrgency,
} from '../../core/inventory/types'
import { InventoryStatusBadge } from './InventoryStatusBadge'

interface Props {
  readonly initialQuery?: string
  readonly items: readonly CanonicalInventoryItem[]
  readonly recommendations: readonly ReplenishmentRecommendation[]
  readonly productImages?: Readonly<Record<string, string>>
  readonly productTitles?: Readonly<Record<string, string>>
  readonly onEditSettings?: (sku: string) => void
  readonly onSelectSku?: (sku: string) => void
}

type FilterTab = 'ALL' | 'REORDER_NEEDED' | 'OUT_OF_STOCK' | 'IN_STOCK'

function formatQty(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'Unknown'
  return val.toLocaleString('en-IN')
}

export const InventoryTable: React.FC<Props> = ({
  initialQuery = '',
  items,
  recommendations,
  productImages = {},
  productTitles = {},
  onEditSettings,
  onSelectSku,
}) => {
  const [limit,setLimit]=useState(50)
  const [filterTab, setFilterTab] = useState<FilterTab>('ALL')
  const [searchQuery, setSearchQuery] = useState(initialQuery)

  useEffect(()=>setLimit(50),[searchQuery,filterTab])
  const recMap = useMemo(() => {
    const map = new Map<string, ReplenishmentRecommendation>()
    for (const rec of recommendations) {
      map.set(JSON.stringify([rec.identity.sellerAccount,rec.identity.marketplace,rec.identity.sku,rec.identity.fulfillmentChannel]), rec)
    }
    return map
  }, [recommendations])

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return items.filter(item => {
      // Search matching
      if (query) {
        const title = (productTitles[item.sku] || item.title || '').toLowerCase()
        const sku = item.sku.toLowerCase()
        const asin = (item.asin || '').toLowerCase()
        if (!title.includes(query) && !sku.includes(query) && !asin.includes(query)) {
          return false
        }
      }

      const rec = recMap.get(JSON.stringify([item.sellerAccount,item.marketplace,item.sku,item.fulfillmentChannel]))
      const urgency: ReplenishmentUrgency = rec?.urgency ?? 'UNAVAILABLE'

      if (filterTab === 'REORDER_NEEDED') {
        return urgency === 'OUT_OF_STOCK' || urgency === 'CRITICAL_REORDER' || urgency === 'REORDER_SOON'
      }
      if (filterTab === 'OUT_OF_STOCK') {
        return urgency === 'OUT_OF_STOCK'
      }
      if (filterTab === 'IN_STOCK') {
        return urgency === 'HEALTHY' || urgency === 'EXCESS_STOCK'
      }

      return true
    })
  }, [items, recMap, searchQuery, filterTab, productTitles])

  const visibleItems=filteredItems.slice(0,limit)
  return (
    <div className="inventory-view-container">
      {/* Controls Bar */}
      <div className="inventory-controls-bar">
        <div className="inventory-search-wrap">
          <input
            type="search"
            className="inventory-search-input"
            placeholder="Search by SKU, ASIN or title…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Filter inventory"
          />
        </div>

        <div className="inventory-filter-tabs" role="tablist" aria-label="Filter inventory status">
          <button
            type="button"
            className={`inventory-tab-btn ${filterTab === 'ALL' ? 'active' : ''}`}
            onClick={() => setFilterTab('ALL')}
            role="tab"
            aria-selected={filterTab === 'ALL'}
          >
            All Items ({items.length})
          </button>
          <button
            type="button"
            className={`inventory-tab-btn ${filterTab === 'REORDER_NEEDED' ? 'active' : ''}`}
            onClick={() => setFilterTab('REORDER_NEEDED')}
            role="tab"
            aria-selected={filterTab === 'REORDER_NEEDED'}
          >
            Reorder Needed
          </button>
          <button
            type="button"
            className={`inventory-tab-btn ${filterTab === 'OUT_OF_STOCK' ? 'active' : ''}`}
            onClick={() => setFilterTab('OUT_OF_STOCK')}
            role="tab"
            aria-selected={filterTab === 'OUT_OF_STOCK'}
          >
            Out of Stock
          </button>
          <button
            type="button"
            className={`inventory-tab-btn ${filterTab === 'IN_STOCK' ? 'active' : ''}`}
            onClick={() => setFilterTab('IN_STOCK')}
            role="tab"
            aria-selected={filterTab === 'IN_STOCK'}
          >
            Healthy
          </button>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="inventory-empty-state" role="status">
          <p>No inventory items match the current filters.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="inventory-table-scroll">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Channel</th>
                  <th scope="col" className="text-right">Available</th>
                  <th scope="col" className="text-right">Inbound</th>
                  <th scope="col" className="text-right">Reserved</th>
                  <th scope="col" className="text-right">Daily Demand</th>
                  <th scope="col" className="text-right">Stock Cover</th>
                  <th scope="col">Reorder Status</th>
                  <th scope="col" className="text-right">Suggested Order</th>
                  <th scope="col" className="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map(item => {
                  const rec = recMap.get(JSON.stringify([item.sellerAccount,item.marketplace,item.sku,item.fulfillmentChannel]))
                  const imgUrl = productImages[item.sku] ?? item.imageUrl
                  const title = productTitles[item.sku] || item.title || item.sku

                  return (
                    <tr key={item.id} className="inventory-row">
                      <td className="inventory-cell-product">
                        <div className="inventory-product-flex">
                          {imgUrl ? (
                            <ProductThumbnail url={imgUrl}/>
                          ) : (
                            <div className="inventory-thumb-placeholder" aria-hidden="true">
                              📦
                            </div>
                          )}
                          <div className="inventory-product-meta">
                            <span
                              className="inventory-product-title"
                              title={title}
                              onClick={() => onSelectSku?.(item.id)}
                            >
                              {title}
                            </span>
                            <div className="inventory-id-tags">
                              <span className="inventory-sku-tag">{item.sku}</span>
                              {item.asin ? (
                                <span className="inventory-asin-tag">{item.asin}</span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="inventory-cell-channel">
                        <span className={`inventory-channel-pill ${item.fulfillmentChannel.toLowerCase()}`}>
                          {item.fulfillmentChannel}
                        </span>
                      </td>

                      <td className="inventory-cell-qty text-right">
                        <strong>{formatQty(item.quantities.available)}</strong>
                        {item.quantities.manualPhysical ? (
                          <small className="inventory-manual-sub" title="Manual warehouse physical count">
                            +{item.quantities.manualPhysical} wh
                          </small>
                        ) : null}
                      </td>

                      <td className="inventory-cell-qty text-right">
                        {formatQty(item.quantities.inbound)}
                        {item.quantities.inboundBreakdown?.shipped ? (
                          <small className="inventory-inbound-sub" title="Shipped in transit">
                            ({item.quantities.inboundBreakdown.shipped} shp)
                          </small>
                        ) : null}
                      </td>

                      <td className="inventory-cell-qty text-right">
                        {formatQty(item.quantities.reserved)}
                      </td>

                      <td className="inventory-cell-demand text-right">
                        {rec?.dailyDemand !== null && rec?.dailyDemand !== undefined ? (
                          <span>{rec.dailyDemand.toFixed(1)}/day</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>

                      <td className="inventory-cell-cover text-right">
                        {rec?.stockCoverDays !== null && rec?.stockCoverDays !== undefined ? (
                          <span
                            className={
                              rec.stockCoverDays <= 14
                                ? 'stock-cover-low'
                                : rec.stockCoverDays > 90
                                  ? 'stock-cover-high'
                                  : ''
                            }
                          >
                            {rec.stockCoverDays.toFixed(0)} days
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>

                      <td className="inventory-cell-status">
                        <InventoryStatusBadge urgency={rec?.urgency ?? 'UNAVAILABLE'} />
                      </td>

                      <td className="inventory-cell-order text-right">
                        {rec?.suggestedQuantity !== null && rec?.suggestedQuantity !== undefined && rec.suggestedQuantity > 0 ? (
                          <strong className="inventory-suggested-highlight">
                            {rec.suggestedQuantity.toLocaleString('en-IN')}
                          </strong>
                        ) : rec?.urgency === 'HEALTHY' || rec?.urgency === 'EXCESS_STOCK' ? (
                          <span className="text-muted">0</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>

                      <td className="inventory-cell-action text-center">
                        <button
                          type="button"
                          className="inventory-action-btn"
                          onClick={() => onEditSettings?.(item.id)}
                          aria-label={`Settings for ${item.sku}`}
                          title="Configure lead time & replenishment rules"
                        >
                          Restock settings
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View */}
          <div className="inventory-mobile-list">
            {visibleItems.map(item => {
              const rec = recMap.get(JSON.stringify([item.sellerAccount,item.marketplace,item.sku,item.fulfillmentChannel]))
              const imgUrl = productImages[item.sku] ?? item.imageUrl
              const title = productTitles[item.sku] || item.title || item.sku

              return (
                <article key={item.id} className="inventory-mobile-card">
                  <header className="inventory-mobile-card-header">
                    <div className="inventory-product-flex">
                      {imgUrl ? (
                        <ProductThumbnail url={imgUrl}/>
                      ) : (
                        <div className="inventory-thumb-placeholder" aria-hidden="true">
                          📦
                        </div>
                      )}
                      <div>
                        <button type="button"
                          className="inventory-product-title"
                          onClick={() => onSelectSku?.(item.id)}
                        >
                          {title}
                        </button>
                        <div className="inventory-id-tags">
                          <span className="inventory-sku-tag">{item.sku}</span>
                          <span className={`inventory-channel-pill ${item.fulfillmentChannel.toLowerCase()}`}>
                            {item.fulfillmentChannel}
                          </span>
                        </div>
                      </div>
                    </div>
                    <InventoryStatusBadge urgency={rec?.urgency ?? 'UNAVAILABLE'} />
                  </header>

                  <div className="inventory-mobile-card-body">
                    <div className="inventory-mobile-stat">
                      <small>Stock on hand</small>
                      <strong>{formatQty(rec?.usableStock ?? item.quantities.available)}</strong>
                    </div>
                    <div className="inventory-mobile-stat">
                      <small>{item.stockBasis==='MANUAL_PHYSICAL'?'Listed on Amazon':'Inbound stock'}</small>
                      <span>{formatQty(item.stockBasis==='MANUAL_PHYSICAL'?item.quantities.listed:item.quantities.inbound)}</span>
                    </div>
                    <div className="inventory-mobile-stat">
                      <small>Days remaining</small>
                      <span>
                        {rec?.stockCoverDays !== null && rec?.stockCoverDays !== undefined
                          ? `${rec.stockCoverDays.toFixed(0)}d`
                          : '—'}
                      </span>
                    </div>
                    <div className="inventory-mobile-stat">
                      <small>Suggested reorder</small>
                      <strong className={rec?.suggestedQuantity ? 'inventory-suggested-highlight' : ''}>
                        {rec?.suggestedQuantity !== null && rec?.suggestedQuantity !== undefined
                          ? rec.suggestedQuantity.toLocaleString('en-IN')
                          : '—'}
                      </strong>
                    </div>
                  </div>

                  {rec?.urgency==='UNAVAILABLE'?<p className="inventory-missing-help">{item.stockBasis==='MANUAL_PHYSICAL'&&item.quantities.manualPhysical===null?'Enter your physical stock count to get a restock suggestion.':rec.dailyDemand===null?'Shipment history is incomplete. Your stock is saved; recommendations need more order data.':'Open details to see which stock or replenishment inputs are missing.'}</p>:null}
                  <footer className="inventory-mobile-card-footer">
                    <span className="inventory-demand-sub">
                      Shipped order rate: {rec?.dailyDemand!==null&&rec?.dailyDemand!==undefined ? `${rec.dailyDemand.toFixed(1)} units/day` : 'Unknown'}
                    </span>
                    <button type="button" className="inventory-action-btn" onClick={()=>onSelectSku?.(item.id)}>{item.stockBasis==='MANUAL_PHYSICAL'&&item.quantities.manualPhysical===null?'Enter stock':'Details'}</button>
                    <button
                      type="button"
                      className="inventory-action-btn"
                      onClick={() => onEditSettings?.(item.id)}
                    >
                      Restock settings
                    </button>
                  </footer>
                </article>
              )
            })}
          </div>
        </>
      )}
      {filteredItems.length>limit?<button className="inventory-secondary-btn" onClick={()=>setLimit(value=>value+50)}>Show more items ({filteredItems.length-limit} remaining)</button>:null}
    </div>
  )
}
