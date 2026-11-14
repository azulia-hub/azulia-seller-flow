# Source Code Review: Phone Freshness, Receipts, and Mobile Inventory Fixes

**Date**: 2026-11-14  
**Scope**: Read-only source inspection of uncommitted phone feedback fixes.  
**Review Target**:
1. Recent-order priority and pagination (`src/adapters/amazon-hosted/client.ts`, `src/adapters/amazon-hosted/enrichment.ts`, `src/adapters/amazon-hosted/cacheTypes.ts`)
2. Android refresh queue and request receipts (`LiveSync.java`, `HeadlessSync.java`, `DeviceBridge.java`, `src/background/main.ts`, `src/adapters/amazon-report-sync/requestRefresh.ts`)
3. Pull-to-refresh gesture and feedback (`src/components/PullToRefresh.tsx`)
4. Product comparisons and mobile inventory (`src/components/ProductComparison.tsx`, `src/core/analytics/productPerformance.ts`, `src/features/inventory/InventoryTable.tsx`, `src/features/inventory/InventoryWorkspace.tsx`, `src/features/inventory/ReplenishmentSettingsForm.tsx`, `src/features/inventory/inventory.css`)

---

## Part 1: Confirmed Defects

### 1. Premature 100% / "Sync complete" Freshness Claim When Main Loop Exits on Deadline
- **Severity**: High
- **File / Line**: [`src/adapters/amazon-hosted/client.ts#L558-L565`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-hosted/client.ts#L558-L565)
- **Trigger**: When `syncHosted` exits its processing loop at line 382 because `Date.now() >= deadline` (e.g. `options.budgetMs` of 120,000ms set by `src/background/main.ts` expires), while unexecuted jobs remain in the queue (e.g., incomplete recent stream or pending history jobs for the scope).
- **Consequence**: Because `abort.signal.aborted` is `false` and `finalIssues` is `0`, the completion block unconditionally publishes `percent: 100` and `progress: 'Requested sync complete. Up to date with Amazon.'` (or `'Synced with Amazon just now.'`). The UI and observer receive a false 100% completion claim even though the sync run stopped prematurely due to budget exhaustion.
- **Suggested Correction**: Check whether incomplete jobs for the current scope or unfinished recent streams remain before publishing a 100% completion notice. If unexecuted jobs or an active `lane: 'recent'` stream remain, publish progress stating that remaining history/orders will continue in the next scheduled cycle, with actual completed percentage rather than forcing `percent: 100`.

---

### 2. Accidental Wiping of Saved Physical Stock to `null` in `InventoryWorkspace`
- **Severity**: High
- **File / Line**: [`src/features/inventory/InventoryWorkspace.tsx#L28-L32`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/features/inventory/InventoryWorkspace.tsx#L28-L32)
- **Trigger**:
  1. A user selects an item that already has an entered physical stock count (e.g. 50).
  2. In `InventoryTable`, `onSelectSku={id => { setSelectedId(id); setPhysical('') }}` clears the `physical` state string to `''`.
  3. The details section displays `Physical count: 50`, but the `<input type="number" value={physical} ... />` is blank.
  4. If the user taps "Save physical count", line 32 evaluates `const count = physical.trim() === '' ? null : Number(physical)`, which sets `count = null`.
- **Consequence**: Tapping "Save physical count" when the input field is blank silently overwrites the previously saved physical count with `null`, removing the recorded stock and causing replenishment recommendations to revert to `UNAVAILABLE`.
- **Suggested Correction**: Initialize `physical` to `selected.quantities.manualPhysical !== null ? String(selected.quantities.manualPhysical) : ''` whenever `selectedId` changes. Additionally, do not convert an empty string into `null` on save without explicit intent (e.g. provide a dedicated "Clear count" button).

---

### 3. Dropped Refresh Requests During Service Cold-Start / Restart in `LiveSync`
- **Severity**: High
- **File / Line**: [`android/app/src/main/java/in/azulia/seller/LiveSync.java#L40`](file:///mnt/new-volume/Projects/azulia-seller-flow/android/app/src/main/java/in/azulia/seller/LiveSync.java#L40) and [`#L46`](file:///mnt/new-volume/Projects/azulia-seller-flow/android/app/src/main/java/in/azulia/seller/LiveSync.java#L46)
- **Trigger**: `LiveSync.request()` or `LiveSync.continueRequest()` is called when `instance == null` (e.g., while the Android Foreground Service is starting up asynchronously or during service recreation). If two requests arrive before the service instance is live:
  ```java
  else prefs(activity).edit().putString("requested", validateIntent(intent).toString()).apply();
  ```
- **Consequence**: The second request completely overwrites `prefs("requested")` without merging. The first request's `requestId` is erased from the queue. Its receipt in `SharedPreferences` remains indefinitely in `"state": "queued"`. In `requestReportRefresh.ts`, the frontend polls for 8 minutes and then times out with `'queued'`, never completing.
- **Suggested Correction**: In the `else` branch of both `request()` and `continueRequest()`, read existing `prefs.getString("requested", null)`. If present, merge via `merge(new JSONObject(existing), safe)` before applying to `SharedPreferences`.

---

### 4. Non-Atomic Recent Orders Watermark Checkpoint Across Storage Transactions
- **Severity**: Medium-High
- **File / Line**: [`src/adapters/amazon-hosted/client.ts#L477-L489`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-hosted/client.ts#L477-L489) and [`src/adapters/amazon-hosted/cache.ts#L196-L200`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-hosted/cache.ts#L196-L200)
- **Trigger**: When the final page (`!nextToken`) of `job.lane === 'recent'` completes, `commitPage()` runs in one storage transaction (committing records/orders and removing `job` from `state.jobs`). Then, in a separate subsequent `checkedUpdate()` call at line 485, `recentOrdersCheckedAt` and `recentOrdersThrough` are updated.
- **Consequence**: If a browser tab crash, reload, or exception occurs immediately after `commitPage()` but before `checkedUpdate()`, the recent job is already deleted from `state.jobs`, but `recentOrdersThrough` is never updated. On resume, `pendingRecent` is gone and the watermark remains old, leading to redundant historical catchup or failing freshness validation.
- **Suggested Correction**: Update `recentOrdersCheckedAt` and `recentOrdersThrough` atomically inside `commitPage()` in `cache.ts` within the same transaction that sets `current.state = 'completed'` and removes the job, matching how `purchaseCoverage` and `coverage` are committed.

---

### 5. Misleading Zero Baseline for Percentage-Point Metrics (`margin`, `returnRate`)
- **Severity**: Medium
- **File / Line**: [`src/core/analytics/productPerformance.ts#L41-L54`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/analytics/productPerformance.ts#L41-L54) and [`src/components/ProductComparison.tsx#L3-L8`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/components/ProductComparison.tsx#L3-L8)
- **Trigger**: A product had zero gross sales (`grossSales === 0`) or zero shipped units in the previous period, but has sales/margin in the current period.
- **Consequence**: For `margin` and `returnRate`, `points = true` is passed to `compare()`. Because `points === true`, the zero-baseline guard:
  ```typescript
  if (!points && old === 0) return { value, previous: old, change: null, kind, status: 'ZERO_BASELINE' }
  ```
  does not fire! Line 42 computes `change = value - 0 = +value pp` with `status: 'AVAILABLE'`. In `ProductComparison.tsx`, it renders:
  `Previously 0% · +25 pp vs previous period`.
  A period with zero sales did not have a 0% margin—it had no baseline. Reporting a 25 percentage-point margin expansion against zero sales is misleading.
- **Suggested Correction**: In `compareProductPerformance`, check whether the denominator was zero in the prior period (`previous?.grossSales === 0` for margin; `previous?.soldQuantity === 0` for returnRate). If zero, return `status: 'NO_BASELINE'` or `'ZERO_BASELINE'` to suppress misleading point changes.

---

### 6. Call Stack Overflow Risk with Spread Operator in `comparisonObservationCutoff`
- **Severity**: Medium
- **File / Line**: [`src/core/analytics/productPerformance.ts#L78`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/analytics/productPerformance.ts#L78)
- **Trigger**: When `financial` or `purchases` sync ranges accumulate many entries (e.g. over weeks of incremental 15-minute sync cycles):
  ```typescript
  const high = (ranges: readonly SyncRange[]) => Math.max(...ranges.map(range => Date.parse(range.to)).filter(Number.isFinite))
  ```
- **Consequence**: In JavaScript engines (such as V8 inside the Android WebView), spreading large arrays (`...array`) into function arguments exceeds the maximum call stack size, throwing `RangeError: Maximum call stack size exceeded` and breaking rendering in `App.tsx#L299`.
- **Suggested Correction**: Replace argument spreading with `ranges.reduce((max, range) => { const t = Date.parse(range.to); return Number.isFinite(t) && t > max ? t : max; }, -Infinity)`.

---

### 7. Unbounded Duplicate Recent Finance Jobs on Re-Sync
- **Severity**: Medium
- **File / Line**: [`src/adapters/amazon-hosted/client.ts#L349-L350`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-hosted/client.ts#L349-L350)
- **Trigger**: Every time `syncHosted` runs, lines 349-350 create a job:
  ```typescript
  const recent = { from: new Date(Math.max(0, requestCutoff - 3 * 86400000)).toISOString(), to: new Date(requestCutoff).toISOString() }
  appendJob(state, makeJob('finance', recent))
  ```
- **Consequence**: `requestCutoff` is dynamic (`Date.now() - 5 * 60000`). Because `stableJobId` includes `from` and `to`, each sync invocation generates a different job ID with millisecond-different timestamps. If a previous finance job was paused or incomplete, `state.jobs` accumulates multiple overlapping 3-day finance jobs instead of resuming or coalescing them (unlike the purchase lane which now has `pendingRecent`).
- **Suggested Correction**: Coalesce recent finance jobs similarly to recent purchases: inspect `state.jobs` for any existing recent `kind === 'finance'` job before appending a new one.

---

### 8. Discarded Priority `orderIds` in `LiveSync.merge`
- **Severity**: Medium
- **File / Line**: [`android/app/src/main/java/in/azulia/seller/LiveSync.java#L30-L35`](file:///mnt/new-volume/Projects/azulia-seller-flow/android/app/src/main/java/in/azulia/seller/LiveSync.java#L30-L35)
- **Trigger**: An intent with `orderIds` (from an order modal or detail prioritization) is pending in `requested`, and a periodic check or pull refresh (`next`) arrives and triggers `merge(old, next)`.
- **Consequence**: `merge()` creates `result = new JSONObject(next.toString())` and merges `from`, `to`, `force`, and `requestIds`, but omits `orderIds`. If `next` has no `orderIds`, the pending priority `orderIds` in `old` are lost.
- **Suggested Correction**: In `merge()`, union `orderIds` from both `old` and `next` using a `Set<String>`, capping at the 250 limit (identical to how `requestIds` are merged).

---

### 9. Lack of Cancellation for Native Refresh Polling on Component Unmount
- **Severity**: Medium
- **File / Line**: [`src/components/PullToRefresh.tsx#L37`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/components/PullToRefresh.tsx#L37) and [`src/adapters/amazon-report-sync/requestRefresh.ts#L15-L21`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-report-sync/requestRefresh.ts#L15-L21)
- **Trigger**: User pulls to refresh on Android. `requestReportRefresh` enters its 8-minute polling loop (`while (Date.now() < deadline) await pause(750)`). The user navigates away to another tab or unmounts the view.
- **Consequence**: `PullToRefresh` sets `disposed = true`, but `requestReportRefresh` has no `AbortSignal`. The 750ms polling loop continues firing bridge messages across the native boundary for up to 8 minutes in the background, consuming CPU and bridge bandwidth.
- **Suggested Correction**: Allow `onRefresh` and `requestReportRefresh` to accept an `AbortSignal`, and abort the polling loop when `PullToRefresh` unmounts.

---

## Part 2: Hypotheses and Observational Findings

### 10. `appendJob` Does Not Re-Apply `lane` on Existing Jobs
- **Status**: Hypothesis / Low Risk
- **File / Line**: [`src/adapters/amazon-hosted/client.ts#L286-L290`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-hosted/client.ts#L286-L290)
- **Observation**: If a job already exists in `state.jobs` with the same stable ID, `appendJob` only updates `old.scope = job.scope` and does not assign `old.lane = job.lane`. Line 353 explicitly works around this by mutating `pendingRecent.lane = 'recent'`, but line 488 relies on `appendJob`.
- **Impact**: Minimal in current flow because follow-up jobs at line 488 have new `ordersCutoff` timestamps, but updating `old.lane = job.lane ?? old.lane` in `appendJob` would ensure consistency.

### 11. Stale `requestStatus` If `requestId` Purged or Unrecognized
- **Status**: Hypothesis / Low Risk
- **File / Line**: [`android/app/src/main/java/in/azulia/seller/LiveSync.java#L38`](file:///mnt/new-volume/Projects/azulia-seller-flow/android/app/src/main/java/in/azulia/seller/LiveSync.java#L38)
- **Observation**: If `raw == null` in `requestStatus()`, it returns `new JSONObject().put("state", "queued")`.
- **Impact**: If a request ID was never registered or was pruned after 24 hours, callers polling status will believe it is still queued rather than expired or not found. Returning `{"state": "unknown"}` when not found in `SharedPreferences` would prevent misleading clients.

### 12. Unused `busy` Prop on `PullToRefresh`
- **Status**: Observational / Minor
- **File / Line**: [`src/components/PullToRefresh.tsx#L3`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/components/PullToRefresh.tsx#L3)
- **Observation**: `busy: boolean` is declared on `Props` and passed from `App.tsx`, but is not read anywhere in `PullToRefresh.tsx` (the component now gates pulls purely on its internal `active` state and explicit promise resolution).
- **Impact**: Harmless dead property in component contract. Can be removed or marked optional to avoid confusion.

---

## Part 3: Architecture & Invariant Compliance Summary

| Checkpoint | Status | Notes |
| :--- | :--- | :--- |
| **Bridge Version Consistency** | Passed | Version 8 is consistent across `DeviceBridge.java`, `bridge.ts`, and `public/device-bridge.json`. |
| **Mobile CSS & Viewport Shrinkage** | Passed | Flex/grid children in `inventory.css` have `min-width: 0`, and card stats/headers wrap appropriately. |
| **Core TS Independence** | Passed | No React, DOM, or bridge APIs leaked into `src/core/analytics/` or `src/core/inventory/`. |
| **Unknown Data & Null Handling** | Passed | Unknown quantities remain `null`, and UI displays "Unknown" rather than converting to 0. |
| **Atomic Page Commit Invariant** | Warning | Page commits are atomic, but recent-order watermark update at line 485 is split into a secondary transaction (Defect #4). |
| **Zero Baseline Safety** | Warning | Percentage metrics guard against zero baseline, but point metrics (`margin`, `returnRate`) emit point differences against zero-sales periods (Defect #5). |
