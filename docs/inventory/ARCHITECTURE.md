# Inventory & Replenishment Engine Architecture

## 1. Core Principles & System Boundaries

As mandated by `AGENTS.md` and `PROJECT_CONTEXT.md`, the inventory and replenishment engine adheres to these core architectural rules:

1. **Pure Generic Domain (`src/core/inventory/`)**:
   - Zero dependencies on React, Dexie, DuckDB, Node, DOM, or marketplace terminology.
   - Deterministic and testable in isolation.
   - Accepts generic records and configuration; returns immutable results.
   - `DATA + SPECIFICATION = RESULT`.

2. **Marketplace Isolation (`src/adapters/amazon-inventory/`)**:
   - SP-API FBA Inventory (`getInventorySummaries`) and Listings Items parsers are completely isolated from generic core logic.
   - Marketplace-specific structures are mapped into `CanonicalInventoryItem`.
   - Raw source payloads and unknown fields are strictly preserved.

3. **Presentational UI Separation (`src/features/inventory/`)**:
   - React components render purely from props and callbacks.
   - Zero business calculations or forecasting formulas in UI components.
   - No direct database access, network requests, or background intervals.

---

## 2. Inventory Identity & Stock Semantics

Every tracked inventory item is identified by a deterministic composite key:
```text
${sellerAccount}:${marketplace}:${sku}:${fulfillmentChannel}
```

### Stock Categories Kept Strictly Distinct

| Category | Definition | FBA Semantics | FBM Semantics |
| :--- | :--- | :--- | :--- |
| **Available** | Sellable units on hand ready to dispatch | `fulfillableQuantity` in Amazon FC | `null` (not held in FC) |
| **Reserved** | Units held for customer orders or logistics | `totalReservedQuantity` (orders, FC transfer, processing) | `null` |
| **Inbound** | Stock en route to fulfillment network | Working, shipped, receiving | `null` |
| **Unsellable** | Damaged, defective, or expired inventory | Customer damaged, warehouse damaged, defective | `null` |
| **Listed** | Quantity offered on active listing | `null` (controlled by FBA available) | Merchant advertised quantity |
| **Manual Physical** | External seller warehouse count | Manually entered by seller | Manually entered by seller |

> [!IMPORTANT]
> **No Double-Counting Invariant**:
> In Amazon FBA, `available` (fulfillable) is **already net of reserved units**. Reserved units are allocated to buyer orders or internal FC transfers. Therefore, `usableStock` is simply `available` (or `available + manualPhysical`). The engine **never subtracts reserved stock a second time**.

> [!NOTE]
> **Unknown vs Zero**:
> If a source omits a quantity or returns a malformed response, the value is preserved as `null`. It is **never silently assumed to be 0**.

---

## 3. Demand Forecasting & Stockout Bias

Demand is derived strictly from **shipped customer order quantities**, never financial SALE rows or unconfirmed orders:

```text
Shipped Day Points: Date (YYYY-MM-DD) -> Shipped Units (count)
```

### Invariants:
1. **Financial Event Isolation**: Financial records may contain refunds, SAFE-T claims, promo adjustments, and multiple item components. Shipped demand uses verified physical shipments only.
2. **Refunds Do Not Restore Stock**: Customer returns do not automatically return to sellable inventory without inspection; they must not artificially reduce customer demand.
3. **Configurable Windows**: 7, 14, 30, 60, and 90-day rolling horizons.
4. **Stockout Bias Detection**: If an item had 0 usable stock on an observed day, customer demand was artificially constrained by unavailability. The engine flags `hasStockoutBias: true` and urgency `STOCKOUT_BIASED` to alert the seller that historical demand is understated.
5. **No Infinite Stock-Cover Days**: When daily demand is `0`, `stockCoverDays` is `null` (never `Infinity` or `NaN`).

---

## 4. Deterministic Replenishment Mathematics

Replenishment recommendations calculate exact purchase order quantities using seller-configured lead times and coverage targets:

```text
Reorder Point  = dailyDemand × (leadTimeDays + safetyStockDays)
Target Stock   = dailyDemand × (leadTimeDays + safetyStockDays + replenishmentCoverageDays)
Deficit        = Target Stock − Usable Stock − Qualifying Inbound
Suggested Qty  = max(0, Deficit)
```

### MOQ & Case Pack Rounding
Batch constraints are applied **ONLY when suggested quantity > 0**:
```text
if (Suggested Qty > 0) {
  Suggested Qty = max(Suggested Qty, minOrderQuantity)
  Suggested Qty = ceil(Suggested Qty / packMultiple) × packMultiple
}
```
If `Suggested Qty <= 0`, it remains `0`. The engine will never suggest ordering the supplier's MOQ when stock is already healthy.

### Urgency Classification:
- **`OUT_OF_STOCK`**: `usableStock <= 0`
- **`CRITICAL_REORDER`**: `usableStock <= (dailyDemand × leadTimeDays)` (stock will run out before a fresh order can arrive).
- **`REORDER_SOON`**: `usableStock <= reorderPoint`
- **`HEALTHY`**: `reorderPoint < usableStock <= (targetStock × 1.5)`
- **`EXCESS_STOCK`**: `usableStock > (targetStock × 1.5)`
- **`UNAVAILABLE`**: Missing lead time, unknown usable stock, or missing shipment demand. Explicit reasons are populated in `unavailableReasons`.
