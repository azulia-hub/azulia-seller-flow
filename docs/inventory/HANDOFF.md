# Inventory & Replenishment Handoff to Codex

This handoff documents the newly created Inventory & Replenishment domain, parsers, and UI components built in isolation per the boundaries in `docs/INVENTORY_HANDOFF.md`.

> [!IMPORTANT]
> **Implementation Boundaries Maintained**:
> - Zero existing files were modified.
> - No shared config, packages, styles, native code, or existing databases were touched.
> - No tests, typechecks, builds, APK commands, or live API probes were executed.

---

## 1. Inventory of Newly Created Files

### A. Core Inventory Domain (`src/core/inventory/`)
1. **[src/core/inventory/types.ts](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/inventory/types.ts)**:
   - Pure generic domain types.
   - `InventoryIdentity`: `sellerAccount + marketplace + sku + fulfillmentChannel`.
   - `StockQuantities`: available, reserved, inbound, unsellable, listed, manualPhysical. Unknowns are strictly `null`, never `0`.
   - `ReplenishmentConfig`: lead time, safety stock, coverage days, MOQ, pack multiple, qualifying inbound checkboxes.
   - `ReplenishmentRecommendation`: reorder point, target stock, usable stock, raw and final suggested quantity, urgency classification, explicit `unavailableReasons`.
   - `DemandMetrics`: shipped units, observed days, coverage ratio, stockout bias detection, daily demand rate.
2. **[src/core/inventory/demand.ts](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/inventory/demand.ts)**:
   - `calculateDemandMetrics(shippedPoints, windowDays)`: Pure demand calculation based on shipped units.
   - `buildShippedPointsFromOrders(orders, targetSku, windowDays, anchorDateIso)`: Filters orders for confirmed shipments; excludes canceled/pending; does NOT subtract refunds from shipped customer demand.
3. **[src/core/inventory/replenishment.ts](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/inventory/replenishment.ts)**:
   - `computeReplenishment(item, demand, config, nowIso)`: Deterministic reorder point, target stock, and suggested quantity.
   - `calculateUsableStock(item, config)`: Invariant: available stock is already net of reserved units in FBA; reserved is **never subtracted twice**.
   - `calculateQualifyingInbound(item, config)`: Inbound shipped/receiving qualification without double-counting total inbound.
   - MOQ and pack multiple rounding apply **ONLY when suggested quantity > 0**.
   - Zero demand yields `stockCoverDays: null`, never `Infinity`.
4. **[src/core/inventory/inventoryStatus.ts](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/inventory/inventoryStatus.ts)**:
   - `getReplenishmentBadgeMeta(urgency)`: Status labels and color tones (`positive`, `warning`, `negative`, `neutral`).
   - `summarizeInventoryPortfolio(items, recommendations)`: Aggregates sellable stock, inbound units, and urgency counts across the catalog.
5. **[src/core/inventory/demand.test.ts](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/inventory/demand.test.ts)**:
   - Unexecuted test suite covering shipped aggregation, stockout bias, partial history, zero demand, and order projection.
6. **[src/core/inventory/replenishment.test.ts](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/inventory/replenishment.test.ts)**:
   - Unexecuted test suite covering reorder points, target stock, usable stock, MOQ rounding, zero demand handling, and missing input reasons.

### B. Amazon Inventory Adapters (`src/adapters/amazon-inventory/`)
1. **[src/adapters/amazon-inventory/types.ts](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-inventory/types.ts)**:
   - Raw SP-API interfaces for `getInventorySummaries` and Listings Items API.
2. **[src/adapters/amazon-inventory/fbaInventoryParser.ts](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-inventory/fbaInventoryParser.ts)**:
   - `parseFbaInventoryPage(responseJson)`: Robust parser extracting items and continuation `nextToken`.
   - `parseFbaInventorySummary(summary)`: Granular breakdown parser for fulfillable, working/shipped/receiving inbound, reserved, and unsellable.
3. **[src/adapters/amazon-inventory/listingsInventoryParser.ts](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-inventory/listingsInventoryParser.ts)**:
   - `parseFbmListingRecord(rawItem)`: Parser for FBM listing availability. Preserves `available: null` (since physical stock is not at Amazon FC).
4. **[src/adapters/amazon-inventory/toCanonicalInventory.ts](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-inventory/toCanonicalInventory.ts)**:
   - `fbaRecordsToCanonical(fbaRecords, context)`: Maps parsed FBA records to `CanonicalInventoryItem[]`.
   - `fbmRecordsToCanonical(fbmRecords, context)`: Maps parsed FBM records to `CanonicalInventoryItem[]`.
5. **[src/adapters/amazon-inventory/fbaInventoryParser.test.ts](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-inventory/fbaInventoryParser.test.ts)**:
   - Unexecuted test suite covering envelope extraction, string parsing, pagination termination, and unknown field retention.

### C. Presentational UI Components (`src/features/inventory/`)
1. **[src/features/inventory/InventoryTable.tsx](file:///mnt/new-volume/Projects/azulia-seller-flow/src/features/inventory/InventoryTable.tsx)**:
   - Responsive desktop table and mobile stacked card view.
   - Filter tabs: All, Reorder Needed, Out of Stock, Healthy.
   - Product thumbnail, SKU/ASIN, channel badge, available, inbound, reserved, daily demand, stock cover, status badge, suggested order quantity, and settings button.
2. **[src/features/inventory/InventoryStatusBadge.tsx](file:///mnt/new-volume/Projects/azulia-seller-flow/src/features/inventory/InventoryStatusBadge.tsx)**:
   - Color-coded accessible status badge with tooltip descriptions.
3. **[src/features/inventory/ReplenishmentSettingsForm.tsx](file:///mnt/new-volume/Projects/azulia-seller-flow/src/features/inventory/ReplenishmentSettingsForm.tsx)**:
   - Accessible modal dialog for editing lead time, safety stock, coverage days, MOQ, pack multiple, and qualifying inbound toggles.
4. **[src/features/inventory/InventorySummaryHeader.tsx](file:///mnt/new-volume/Projects/azulia-seller-flow/src/features/inventory/InventorySummaryHeader.tsx)**:
   - Top portfolio metrics: Sellable Stock, Inbound Pipeline, Reserved Units, Reorder Attention count, Out of Stock count.
5. **[src/features/inventory/inventory.css](file:///mnt/new-volume/Projects/azulia-seller-flow/src/features/inventory/inventory.css)**:
   - Scoped styles using system design variables (`--bg`, `--panel`, `--text`, `--muted`, `--border`, `--accent`).
6. **[src/features/inventory/index.ts](file:///mnt/new-volume/Projects/azulia-seller-flow/src/features/inventory/index.ts)**:
   - Feature export barrel.

### D. Documentation (`docs/inventory/`)
1. **[docs/inventory/ARCHITECTURE.md](file:///mnt/new-volume/Projects/azulia-seller-flow/docs/inventory/ARCHITECTURE.md)**: Domain principles, demand models, and replenishment mathematics.
2. **[docs/inventory/STORAGE_AND_SYNC_SPEC.md](file:///mnt/new-volume/Projects/azulia-seller-flow/docs/inventory/STORAGE_AND_SYNC_SPEC.md)**: Storage schemas, coordinator contracts, daily stock history snapshots, and low-stock alert transitions.
3. **[docs/inventory/HANDOFF.md](file:///mnt/new-volume/Projects/azulia-seller-flow/docs/inventory/HANDOFF.md)**: This handoff document.

---

## 2. Proposed Integration Steps for Codex

Once Codex finishes the concurrent Product Performance and navigation work, here is the recommended wiring plan:

### Step 1: Add Navigation Item in `src/app/AppShell.tsx`
Add an "Inventory" tab under the Analytics / Workspace group:
```tsx
{ page: 'Inventory', label: 'Inventory', description: 'Stock & replenishment', icon: '📦', group: 'Workspace' }
```

### Step 2: Render in `src/app/App.tsx`
Import feature components and render when `active === 'Inventory'`:
```tsx
import { InventoryTable, InventorySummaryHeader, ReplenishmentSettingsForm } from '../features/inventory'
import '../features/inventory/inventory.css'

// Inside App component:
{active === 'Inventory' ? (
  <div className="inventory-page-wrap">
    <PageHeader eyebrow="Workspace" title="Inventory & Replenishment" description="Monitor stock levels, daily demand, and calculated reorder quantities." />
    <InventorySummaryHeader summary={inventorySummary} />
    <InventoryTable
      items={canonicalInventory}
      recommendations={inventoryRecommendations}
      productImages={productImages}
      productTitles={productTitles}
      onEditSettings={sku => setSelectedConfigSku(sku)}
      onSelectSku={sku => openProductPage({ sku, scope: 'CURRENT' }, { page: 'Inventory', metric: null })}
    />
    {selectedConfigSku ? (
      <ReplenishmentSettingsForm
        sku={selectedConfigSku}
        productTitle={productTitles[selectedConfigSku]}
        initialConfig={skuConfigs[selectedConfigSku]}
        onSave={(sku, cfg) => saveReplenishmentConfig(sku, cfg)}
        onClose={() => setSelectedConfigSku(null)}
      />
    ) : null}
  </div>
) : null}
```

### Step 3: Register Inventory Fetch Job in Sync Coordinator
In [src/adapters/amazon-hosted/client.ts](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-hosted/client.ts) or [server/local/sync/coordinator.ts](file:///mnt/new-volume/Projects/azulia-seller-flow/server/local/sync/coordinator.ts):
- Add `kind: 'inventory'` to `BrowserJob`.
- Invoke SP-API endpoint:
  ```text
  GET /fba/inventory/v1/summaries?granularityType=Marketplace&granularityId=${marketplaceId}&details=true
  ```
- Parse responses using `parseFbaInventoryPage(responseJson)`.
- Commit pages atomically and update nextToken checkpoints.
- Ensure 403 or 429 errors on inventory do **NOT** fail or block financial synchronization.

---

## 3. Assumptions & Design Decisions

1. **FBA Available Stock Semantics**: FBA `fulfillableQuantity` is already net of reserved units. The engine intentionally does not subtract reserved units again.
2. **FBM Listed Availability**: For merchant-fulfilled items, Amazon does not store physical units; `available` is `null` and `listed` is populated. If the seller enters `manualPhysical` warehouse units, usable stock is calculated from `manualPhysical`.
3. **Demand Horizon**: Shipped customer orders default to a 30-day window, but 7, 14, 60, and 90 days are supported via `DemandWindowDays`.
4. **Zero Demand Stock Cover**: If daily demand is 0, stock cover days is `null` rather than `Infinity`, and status is labeled `NO_OBSERVED_SALES` or `HEALTHY`.
5. **No Direct Database Writes in UI**: All replenishment settings and manual stock inputs flow through explicit callbacks (`onSave`), keeping the presentation layer completely pure.
