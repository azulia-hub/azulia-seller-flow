import type { ReturnItemIdentity, ReturnInspectionRecord, FinancialRecoveryResult } from '../../core/return-recovery/types'
import { ReturnItemStateBadge, RecoveryStatusBadge } from './ReturnRecoveryBadge'
import { ReturnRecoveryItemCard } from './ReturnRecoveryItemCard'

export interface ReturnItemRowData {
  readonly identity: ReturnItemIdentity
  readonly orderId: string
  readonly sku: string
  readonly asin?: string | null
  readonly productTitle?: string | null
  readonly productImage?: string | null
  readonly returnedQuantity: number
  readonly returnDate?: string | null
  readonly unitCost: number | null
  readonly financialNet: number
  readonly consumedCost: number | null
  readonly inspection?: ReturnInspectionRecord | null
  readonly financialResult?: FinancialRecoveryResult | null
}

export interface ReturnRecoveryTableProps {
  readonly items: readonly ReturnItemRowData[]
  readonly searchQuery: string
  readonly onSearchChange: (query: string) => void
  readonly onSelectInspect: (item: ReturnItemRowData) => void
  readonly formatMoney?: (amount: number) => string
}

export function ReturnRecoveryTable({
  items,
  searchQuery,
  onSearchChange,
  onSelectInspect,
  formatMoney = (val: number) => `₹${val.toLocaleString('en-IN')}`,
}: ReturnRecoveryTableProps) {
  return (
    <section className="recovery-table-section" aria-label="Return recovery list">
      <div className="recovery-toolbar">
        <label className="recovery-search-box">
          <span className="recovery-search-icon" aria-hidden="true">🔍</span>
          <input
            type="search"
            value={searchQuery}
            placeholder="Search by Order ID, SKU, ASIN, or product title…"
            onChange={e => onSearchChange(e.target.value)}
          />
        </label>
        <span className="recovery-toolbar-count">
          Showing <strong>{items.length}</strong> return item(s)
        </span>
      </div>

      {items.length === 0 ? (
        <div className="recovery-empty-state">
          <p>No return records match your search or filter.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="recovery-table-desktop">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Order & Return Date</th>
                    <th>Product & SKU</th>
                    <th>Qty</th>
                    <th>Physical Condition</th>
                    <th>Status</th>
                    <th>Marketplace Net</th>
                    <th>Recovered Asset</th>
                    <th>Effective Net</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const dispositions = item.inspection?.dispositions ?? []
                    const status = item.financialResult?.status ?? item.inspection?.overallStatus ?? 'PROVISIONAL'
                    const effectiveNet = item.financialResult?.effectiveNetProfit

                    return (
                      <tr key={`${item.orderId}:${item.sku}`}>
                        <td>
                          <strong>{item.orderId}</strong>
                          {item.returnDate ? <small className="cell-sub">{item.returnDate}</small> : null}
                        </td>
                        <td>
                          <div className="recovery-product-cell">
                            {item.productImage ? (
                              <img src={item.productImage} alt={item.sku} className="recovery-thumb-tiny" />
                            ) : null}
                            <div>
                              <span>{item.productTitle || item.sku}</span>
                              <small className="cell-sub">{item.sku} {item.asin ? `· ${item.asin}` : ''}</small>
                            </div>
                          </div>
                        </td>
                        <td>{item.returnedQuantity}</td>
                        <td>
                          {dispositions.length > 0 ? (
                            <div className="recovery-badge-inline-list">
                              {dispositions.map(d => (
                                <div key={d.id} className="recovery-disp-tag">
                                  <ReturnItemStateBadge state={d.state} />
                                  <span>{d.quantity}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <ReturnItemStateBadge state="AWAITING_INSPECTION" />
                          )}
                        </td>
                        <td>
                          <RecoveryStatusBadge status={status} />
                        </td>
                        <td>{formatMoney(item.financialNet)}</td>
                        <td className="recovery-text-positive">
                          {item.financialResult ? formatMoney(item.financialResult.confirmedRecoveredCost) : '—'}
                        </td>
                        <td className={effectiveNet !== null && effectiveNet !== undefined && effectiveNet >= 0 ? 'recovery-text-positive' : 'recovery-text-negative'}>
                          <strong>{effectiveNet !== null && effectiveNet !== undefined ? formatMoney(effectiveNet) : '—'}</strong>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="secondary text-btn recovery-table-action"
                            onClick={() => onSelectInspect(item)}
                          >
                            {item.inspection ? 'Edit' : 'Inspect'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="recovery-cards-mobile">
            {items.map(item => (
              <ReturnRecoveryItemCard
                key={`${item.orderId}:${item.sku}`}
                orderId={item.orderId}
                sku={item.sku}
                asin={item.asin}
                productTitle={item.productTitle}
                productImage={item.productImage}
                returnedQuantity={item.returnedQuantity}
                returnDate={item.returnDate}
                financialNet={item.financialNet}
                consumedCost={item.consumedCost}
                inspection={item.inspection}
                financialResult={item.financialResult}
                formatMoney={formatMoney}
                onInspect={() => onSelectInspect(item)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
