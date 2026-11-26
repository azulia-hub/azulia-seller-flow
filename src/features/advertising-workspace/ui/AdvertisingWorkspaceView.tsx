import { useState } from 'react'
import type {
  AdvertisingGroup,
  AdvertisingScope,
  AdvertisingWorkspaceViewProps,
} from '../contract'
import './advertisingWorkspace.css'
import { OverviewView } from './OverviewView'
import { CampaignsView } from './CampaignsView'
import { ProductsView } from './ProductsView'
import { SearchTermsView } from './SearchTermsView'
import { EntityDetailView } from './EntityDetailView'
import { GroupEditorModal } from './GroupEditorModal'

export function AdvertisingWorkspaceView({
  model,
  formatMoney,
  onQueryChange,
  onOpenEntity,
  onCloseDetail,
  onRefresh,
  onOpenSettings,
  onOpenFinancialProduct,
  onSaveGroup,
}: AdvertisingWorkspaceViewProps) {
  const { query, availableViews } = model
  const [isGroupModalOpen, setGroupModalOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<AdvertisingGroup | null>(null)

  const activeView = query.view

  // Scope selection helpers
  const handleScopeTypeChange = (scopeType: 'ACCOUNT' | 'PRODUCT' | 'GROUP') => {
    if (scopeType === 'ACCOUNT') {
      onQueryChange({ scope: { kind: 'ACCOUNT' }, page: 1 })
    } else if (scopeType === 'PRODUCT') {
      const firstProd = model.productChoices[0]?.id || ''
      onQueryChange({ scope: { kind: 'PRODUCT', productId: firstProd }, page: 1 })
    } else if (scopeType === 'GROUP') {
      const firstGrp = model.groups[0]
      if (firstGrp) {
        onQueryChange({
          scope: {
            kind: 'GROUP',
            groupId: firstGrp.id,
            version: firstGrp.version,
            productIds: firstGrp.productIds,
          },
          page: 1,
        })
      }
    }
  }

  const handleProductScopeChange = (productId: string) => {
    onQueryChange({ scope: { kind: 'PRODUCT', productId }, page: 1 })
  }

  const handleGroupScopeChange = (groupId: string) => {
    const grp = model.groups.find(g => g.id === groupId)
    if (grp) {
      onQueryChange({
        scope: {
          kind: 'GROUP',
          groupId: grp.id,
          version: grp.version,
          productIds: grp.productIds,
        },
        page: 1,
      })
    }
  }

  const selectedGroupId = query.scope.kind === 'GROUP' ? query.scope.groupId : null
  const currentSelectedGroup = selectedGroupId
    ? model.groups.find(g => g.id === selectedGroupId)
    : null

  const openNewGroupModal = () => {
    setEditingGroup(null)
    setGroupModalOpen(true)
  }

  const openEditGroupModal = () => {
    if (currentSelectedGroup && currentSelectedGroup.origin === 'MANUAL') {
      setEditingGroup(currentSelectedGroup)
      setGroupModalOpen(true)
    }
  }

  return (
    <div className="adsw-root" data-testid="advertising-workspace">
      {/* Workspace Header */}
      <header className="adsw-header">
        <div className="adsw-header-top">
          <div className="adsw-brand-meta">
            <h1 className="adsw-title">Advertising Workspace</h1>
            <span className="adsw-meta-pill">{model.advertiser}</span>
            <span className="adsw-meta-pill">{model.marketplace}</span>
            <span className="adsw-meta-pill">{model.adProductLabel}</span>
            <span className="adsw-meta-pill">{model.currency}</span>
          </div>

          <div className="adsw-header-actions">
            <button
              type="button"
              className="adsw-btn"
              onClick={onRefresh}
              disabled={model.refreshing || model.canRefresh === false}
              title={model.refreshUnavailableReason}
              aria-label="Refresh advertising reports"
            >
              {model.refreshing ? '⟳ Refreshing…' : '⟳ Refresh reports'}
            </button>
            <button
              type="button"
              className="adsw-btn adsw-btn-ghost"
              onClick={onOpenSettings}
              aria-label="Advertising settings"
            >
              Settings ⚙
            </button>
          </div>
        </div>

        {/* Freshness & Coverage Bar */}
        <div className="adsw-freshness-bar" aria-label="Coverage and freshness">
          <div className="adsw-freshness-info">
            <span
              className={`adsw-freshness-dot ${model.refreshing ? 'is-refreshing' : ''}`}
              aria-hidden="true"
            />
            <span>
              {model.lastUpdated
                ? `Updated ${new Date(model.lastUpdated).toLocaleTimeString()}`
                : 'Not yet updated'}
            </span>
            <span>•</span>
            <span>
              {model.coveredFrom && model.coveredTo
                ? `Covered dates: ${model.coveredFrom} – ${model.coveredTo}`
                : 'Coverage window pending'}
            </span>
            <span>•</span>
            <span>{model.basisLabel}</span>
            {model.comparisonLabel ? (
              <>
                <span>•</span>
                <span>{model.comparisonLabel}</span>
              </>
            ) : null}
          </div>
        </div>

        {/* Shared Query Controls: Date & Scope */}
        <div className="adsw-controls-grid">
          <div className="adsw-field"><label className="adsw-label" htmlFor="adsw-target-acos">Review target ACOS (%)</label><input id="adsw-target-acos" className="adsw-input" type="number" min="1" max="100" step="1" value={query.targetAcos ?? 30} onChange={event => onQueryChange({ targetAcos: Number(event.target.value) })} /><small>Efficiency target, not break-even profit</small></div>
          {/* Date Range */}
          <div className="adsw-field">
            <span className="adsw-label">Date Range</span>
            <div className="adsw-date-group">
              <input
                type="date"
                className="adsw-input"
                aria-label="Start date"
                value={query.from}
                onChange={e => onQueryChange({ from: e.target.value, page: 1 })}
              />
              <span style={{ color: 'var(--muted, #716c60)' }}>–</span>
              <input
                type="date"
                className="adsw-input"
                aria-label="End date"
                value={query.to}
                onChange={e => onQueryChange({ to: e.target.value, page: 1 })}
              />
            </div>
          </div>

          {/* Scope Mode Selector */}
          <div className="adsw-field">
            <label className="adsw-label" htmlFor="adsw-scope-kind">
              Investigation Scope
            </label>
            <select
              id="adsw-scope-kind"
              className="adsw-select"
              value={query.scope.kind}
              onChange={e =>
                handleScopeTypeChange(e.target.value as AdvertisingScope['kind'])
              }
            >
              <option value="ACCOUNT">Full Account</option>
              <option value="PRODUCT" disabled={!model.productChoices.length}>Single Product / SKU</option>
              <option value="GROUP" disabled={!model.groups.length}>Product Family / Custom Group</option>
            </select>
          </div>

          {/* Scope Target Selector (Product or Group) */}
          {query.scope.kind === 'PRODUCT' && (
            <div className="adsw-field">
              <label className="adsw-label" htmlFor="adsw-product-picker">
                Target Product
              </label>
              <select
                id="adsw-product-picker"
                className="adsw-select"
                value={query.scope.productId}
                onChange={e => handleProductScopeChange(e.target.value)}
              >
                {model.productChoices.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {query.scope.kind === 'GROUP' && (
            <div className="adsw-field">
              <label className="adsw-label" htmlFor="adsw-group-picker">
                Target Group
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <select
                  id="adsw-group-picker"
                  className="adsw-select"
                  style={{ flex: 1 }}
                  value={query.scope.groupId}
                  onChange={e => handleGroupScopeChange(e.target.value)}
                >
                  {model.groups.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.productIds.length} SKUs ·{' '}
                      {g.origin === 'CATALOG' ? 'Catalog' : 'Manual'})
                    </option>
                  ))}
                </select>
                {currentSelectedGroup?.origin === 'MANUAL' ? (
                  <button
                    type="button"
                    className="adsw-btn"
                    style={{ padding: '4px 8px', fontSize: 12 }}
                    onClick={openEditGroupModal}
                    aria-label="Edit selected group"
                  >
                    Edit
                  </button>
                ) : null}
              </div>
            </div>
          )}

          {/* Action to create new group */}
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              type="button"
              className="adsw-btn adsw-btn-ghost"
              onClick={openNewGroupModal}
            >
              + New custom group
            </button>
          </div>
        </div>
      </header>

      {/* State & Error Banners */}
      {model.error || model.sourceState === 'ERROR' ? (
        <div className="adsw-banner adsw-banner-error" role="alert">
          <strong>Advertising report error:</strong> {model.error || 'Failed to load advertising data.'}
        </div>
      ) : null}

      {model.sourceState === 'PARTIAL' ? (
        <div className="adsw-banner adsw-banner-partial" role="status">
          <strong>Partial coverage:</strong> Reporting data for some requested dates is still
          synchronizing or revising.
        </div>
      ) : null}

      {model.sourceState === 'LOADING' ? (
        <div className="adsw-banner adsw-banner-partial" role="status">
          Loading advertising reports…
        </div>
      ) : null}

      {model.sourceState === 'EMPTY' ? (
        <div className="adsw-banner adsw-banner-partial" role="status">
          No advertising records found for this period and scope. Try selecting a wider date range
          or full account scope.
        </div>
      ) : null}

      {model.notices && model.notices.length > 0 ? (
        <div className="adsw-banner" style={{ background: 'var(--panel2, #f1eee6)' }}>
          <ul className="adsw-notices-list">
            {model.notices.map((notice, idx) => (
              <li key={idx} className="adsw-notice-item">
                {notice}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* View Tabs */}
      <nav className="adsw-nav-tabs" role="tablist" aria-label="Advertising workspace views">
        {availableViews.map(view => {
          const isActive = activeView === view.id
          return (
            <button
              key={view.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`adsw-nav-tab ${isActive ? 'is-active' : ''}`}
              onClick={event => {
                event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
                onQueryChange({ view: view.id, page: 1 })
              }}
            >
              {view.label}
            </button>
          )
        })}
      </nav>

      {/* Active View Body */}
      <main className="adsw-view-content">
        {activeView === 'overview' && (
          <OverviewView
            model={model}
            formatMoney={formatMoney}
            onOpenEntity={onOpenEntity}
            onQueryChange={onQueryChange}
          />
        )}

        {activeView === 'campaigns' && (
          <CampaignsView
            model={model}
            formatMoney={formatMoney}
            onOpenEntity={onOpenEntity}
            onQueryChange={onQueryChange}
          />
        )}

        {activeView === 'products' && (
          <ProductsView
            model={model}
            formatMoney={formatMoney}
            onOpenEntity={onOpenEntity}
            onOpenFinancialProduct={onOpenFinancialProduct}
            onQueryChange={onQueryChange}
          />
        )}

        {activeView === 'searchTerms' && (
          <SearchTermsView
            model={model}
            formatMoney={formatMoney}
            onOpenEntity={onOpenEntity}
            onQueryChange={onQueryChange}
          />
        )}
      </main>

      {/* Entity Detail Drawer */}
      {model.detail ? (
        <EntityDetailView
          key={`${model.detail.entity.kind}:${model.detail.entity.id}`}
          detail={model.detail}
          formatMoney={formatMoney}
          onCloseDetail={onCloseDetail}
          onOpenEntity={onOpenEntity}
          onOpenFinancialProduct={onOpenFinancialProduct}
        />
      ) : null}

      {/* Group Editor Modal */}
      <GroupEditorModal
        isOpen={isGroupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        initialGroup={editingGroup}
        productChoices={model.productChoices}
        onSaveGroup={onSaveGroup}
      />
    </div>
  )
}
