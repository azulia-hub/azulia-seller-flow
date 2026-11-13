# Inventory Storage & Sync Coordinator Specification

This document provides the concrete integration contract for Codex to incorporate the inventory module into the existing sync coordinator, device storage, and background notification layers.

---

## 1. Storage Contract & Data Schemas

### A. Key Format & Versioning
Inventory is stored under account-scoped, versioned storage keys:
```text
inventory:${accountHash}
head:inventory:${accountHash}
```
- Plain readings below 1 MiB serialize as standard JSON.
- Large inventory snapshots serialize with the existing `gz:` base64 compression format in [server/local/deviceStore.ts](file:///mnt/new-volume/Projects/azulia-seller-flow/server/local/deviceStore.ts).
- `head:inventory:${accountHash}` maintains `{ revision: number, updatedAt: string, itemCount: number }`.

### B. Device Storage Implementations
1. **Desktop SQLite (`.local/device-data/workspace.sqlite`)**:
   - Reuses `openDeviceStore` with atomic transactions (`BEGIN IMMEDIATE ... COMMIT`).
   - Handled via `validWorkspaceKey` by allowing `^inventory:[a-f0-9]{64}$`.
2. **Android SQLite (`DeviceDatabase.java`)**:
   - Stores chunked byte buffers under the origin-scoped bridge protocol.
   - Preserves credentials and source isolation.
3. **Browser IndexedDB (`azulia-amazon-browser-source`)**:
   - Dedicated object store: `'inventory'` with index `'account'` and composite key `['account', 'sku', 'fulfillmentChannel']`.

---

## 2. Sync Coordinator Integration

### A. Non-Blocking Independent Job Kind
Add job kind `'inventory'` to `BrowserJob`:
```ts
export interface BrowserJob {
  kind: 'finance' | 'purchases' | 'order' | 'history' | 'catalog' | 'orderItems' | 'inventory'
  nextToken: string | null
  // ...
}
```

### B. Non-Blocking Failure Boundary
> [!IMPORTANT]
> **Financial & Order Sync Independence**:
> Inventory fetch failures (e.g., 403 Forbidden due to missing FBA permissions, or 429 throttling) **MUST NOT** abort or block financial transaction sync or order ingestion.
> If an inventory job fails, mark `state: 'retryLater'` with backoff and continue processing financial/order queues.

### C. Rate Pacing & Allowances
- Amazon SP-API `getInventorySummaries` allowance:
  - Default rate limit: 2 requests/second, burst: 2.
  - Operation key: `'inventory'` in `nextAllowed`.
  - Cooldown on 429: Minimum 5 seconds or value from `Retry-After` header.

### D. Atomic Pagination & Checkpoint Commits
- Pages commit atomically using `commitInventoryPage(account, page)`.
- If `page.nextToken` is present, the job checkpoint is updated with `nextToken`.
- If `page.nextToken` is `null`, the inventory cycle is complete; update `inventoryLastSynced: ISOString` and purge completed jobs.

---

## 3. Stock Snapshot Retention & Stockout Detection

1. **Daily Snapshot History**:
   - Retain one stock snapshot per day for each SKU:
     ```ts
     interface DailyStockSnapshot {
       readonly date: string // YYYY-MM-DD
       readonly available: number
       readonly reserved: number
       readonly inbound: number
     }
     ```
   - Retained for 90 days (sliding window) to power stockout bias detection in demand forecasting.
2. **Stockout Day Detection**:
   - If `available <= 0` on date `D`, date `D` is marked `isStocked: false` in `ShippedDayPoint`.
   - The demand engine will automatically flag `STOCKOUT_BIASED` if customer demand was constrained by zero stock.

---

## 4. Stock-Only Products Handling

In marketplace analytics, some SKUs have physical stock in the fulfillment center but have **zero recorded orders or financial events** in the user's selected date range.

### Integration Rule:
- When building the inventory view, merge products from **two directions**:
  1. Products present in historical orders/financial events.
  2. Products present in canonical inventory items.
- Products with stock but zero recent sales are retained in the inventory list, labeled `NO_OBSERVED_SALES`, with `suggestedQuantity: 0` and `urgency: 'EXCESS_STOCK'` or `'HEALTHY'`.
- They must not disappear merely because the user filtered the dashboard to "Last 7 Days".

---

## 5. Deduplicated Low-Stock & Stockout Alerts

For the Android notification service (`OrderAlerts.java` / `LiveSync.java`) and desktop background runner:

1. **Alert Key Format**:
   ```text
   alert:inventory:${sku}:${transition}
   ```
   Example: `alert:inventory:SHELF-OAK-01:CRITICAL_REORDER`
2. **Transition Rules**:
   - Alert ONLY when an item transitions into a worse urgency state:
     - `HEALTHY` -> `REORDER_SOON`
     - `REORDER_SOON` -> `CRITICAL_REORDER`
     - `CRITICAL_REORDER` -> `OUT_OF_STOCK`
   - Do NOT re-alert on every sync cycle if the item remains in the same state.
   - Do NOT alert when stock improves (e.g. fresh inbound shipment received).
3. **Quiet Updates**:
   - If stock quantity decreases within the same urgency bracket, update the displayed number quietly without firing notification sounds.
