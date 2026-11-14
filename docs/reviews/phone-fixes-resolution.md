# Phone Freshness, Receipts, and Mobile Inventory Fixes — Resolution Report

**Date**: 2026-11-14  
**Scope**: Full implementation and resolution of defects identified in [`docs/reviews/phone-fixes-review.md`](file:///mnt/new-volume/Projects/azulia-seller-flow/docs/reviews/phone-fixes-review.md).  
**Status**: All 9 confirmed findings and 3 minor/observational findings fully resolved. Zero items left unresolved.  
**Constraint Adherence**: In accordance with instructions, zero tests, typechecks, builds, APK packaging/installs, live API requests, server restarts, commits, or git pushes were executed. [`docs/INTEGRATION_READY.md`](file:///mnt/new-volume/Projects/azulia-seller-flow/docs/INTEGRATION_READY.md) remains marked `NOT READY`.

---

## Part 1: Confirmed Findings Resolution

### 1. Accurate Freshness & Progress Notice on Deadline / Time-Budget Exhaustion
- **Issue & Trigger**: When `syncHosted` timed out on `options.budgetMs` (e.g. 120s from background execution), it previously exited the work loop and unconditionally asserted `percent: 100` and `'Requested sync complete. Up to date with Amazon.'` even if jobs remained in `state.jobs` or recent orders were still pending.
- **Applied Resolution**:
  - In [`src/adapters/amazon-hosted/client.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-hosted/client.ts#L571-L595), inspected remaining queued work for the active scope (`remainingScopeJobs`) and active recent stream (`recentPending`).
  - Derived `recentOrdersCaughtUp = Boolean(finalState.recentOrdersThrough && Date.parse(finalState.recentOrdersThrough) >= ordersCutoff - 1000 && !recentPending)` and `workPending = remainingScopeJobs.length > 0 || recentPending`.
  - When `workPending` is true:
    - Caps progress percentage at `Math.min(95, ...)` (defaulting to 90% if total planned is indeterminate), never publishing 100%.
    - If recent orders are caught up but historical jobs remain pending: publishes `'Recent orders are up to date. Remaining history continues automatically.'`.
    - If recent orders themselves timed out: publishes `'Sync reached time budget. Saved progress will resume automatically.'`.
    - Only publishes 100% and `'Requested sync complete. Up to date with Amazon.'` (or `'Synced with Amazon just now.'`) when `!workPending`.
- **Architecture Rationale**: Complies with the AGENTS.md rule against misleading the user or silently asserting freshness when work is incomplete. Accurately distinguishes caught-up recent telemetry from multi-day historical sync.
- **Verification Reasoning**: Code path analysis confirms that when `Date.now() >= deadline` breaks the loop, `workPending` evaluates to true, preventing `percent: 100` from ever being dispatched to subscribers.

---

### 2. Physical Stock Count Preservation and Explicit Clear Action in `InventoryWorkspace`
- **Issue & Trigger**: When selecting an item in `InventoryTable`, `physical` input state was cleared to `''`. If the user clicked "Save physical count", the empty string was converted to `null`, silently overwriting any previously recorded warehouse count.
- **Applied Resolution**:
  - In [`src/features/inventory/InventoryWorkspace.tsx`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/features/inventory/InventoryWorkspace.tsx#L15-L21), added a `useEffect` on `[selectedId, data.settings]` to prefill `physical` from `data.settings?.overrides[selectedId]?.physical` if present.
  - In [`src/features/inventory/InventoryWorkspace.tsx`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/features/inventory/InventoryWorkspace.tsx#L35), updated the save button handler: blank input rejects with an explicit message (`'Enter a physical count, or use Clear count to reset.'`) and non-integers are rejected (`'Enter a nonnegative whole quantity.'`).
  - Added a dedicated "Clear count" button (`type="button"`, rendered only when a saved count exists) that explicitly resets the override count to `null` with a new `countedAt` timestamp.
- **Architecture Rationale**: Prevents accidental destruction of user data while upholding the domain invariant that manual physical counts are explicit snapshot assertions, distinct from Amazon listed stock or default zero.
- **Verification Reasoning**: Static analysis confirms that blank strings cannot trigger a save of `physical: null`. The only code path that writes `null` is the user explicitly clicking "Clear count".

---

### 3. Atomic Cold-Start and Service-Restart Request Merging in `LiveSync`
- **Issue & Trigger**: In `LiveSync.request()` and `continueRequest()`, when `instance == null` (asynchronous foreground service startup), requests wrote to `prefs("requested")` via simple overwrite, discarding prior queued intents and leaving their receipts permanently stalled in `"state": "queued"`.
- **Applied Resolution**:
  - In [`android/app/src/main/java/in/azulia/seller/LiveSync.java`](file:///mnt/new-volume/Projects/azulia-seller-flow/android/app/src/main/java/in/azulia/seller/LiveSync.java#L13-L177), established a shared static lock: `private static final Object QUEUE_LOCK = new Object()`.
  - In `request()`, `continueRequest()`, `coalesceRange()`, `check()`, and `onCreate()`, synchronized all reads, writes, and merges of `prefs("requested")` on `QUEUE_LOCK`.
  - When `instance == null`, the pending intent reads any existing `prefs.getString("requested", null)` and merges them via `merge(new JSONObject(existing), safe)` before persisting to `SharedPreferences`.
- **Architecture Rationale**: Eliminates the cold-start race between WebView bridge dispatch, Android OS service creation, and worker execution threads without altering the single-service lifecycle model.
- **Verification Reasoning**: Static inspection verifies that concurrent arrivals prior to `instance` assignment are serialized by `QUEUE_LOCK` and compounded via `merge()`, preserving all request IDs and query ranges.

---

### 4. Atomic Recent-Orders Watermark Checkpoint in the Same Storage Transaction
- **Issue & Trigger**: In `client.ts`, when the final page (`!nextToken`) of a `lane === 'recent'` job was processed, `commitPage()` committed page data and removed the job in one transaction, but line 485 ran a secondary `checkedUpdate()` call to update `recentOrdersCheckedAt` and `recentOrdersThrough`. An interruption between the two resulted in a deleted job but an un-advanced watermark.
- **Applied Resolution**:
  - In [`src/adapters/amazon-hosted/cache.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-hosted/cache.ts#L205-L209), moved the recent-order watermark commit directly inside `commitPage()` when `!page.nextToken`:
    ```typescript
    if (job.lane === 'recent') {
      state.recentOrdersCheckedAt = new Date().toISOString()
      state.recentOrdersThrough = job.to
      state.jobs = state.jobs.filter(value => !(value.kind === 'purchases' && value.updatedOnly && !value.nextToken && value.lane !== 'recent' && value.from >= job.from && value.to <= job.to))
    }
    ```
  - Guaranteed atomicity across browser IndexedDB (`await done`) and Android SQLite native transactions (`await native.commit()`).
  - In [`src/adapters/amazon-hosted/client.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-hosted/client.ts#L497-L501), removed the duplicate watermark update, retaining only the follow-up recent job scheduling when `Date.parse(job.to) < ordersCutoff - 1000`.
- **Architecture Rationale**: Restores the core transactional integrity invariant: a job removal and its corresponding high-watermark progression must be atomic and crash-consistent across both web and native persistence layers.
- **Verification Reasoning**: Source inspection confirms that `commitPage` commits `state` (including `recentOrdersThrough` and filtered jobs) in a single atomic transaction.

---

### 5. Suppression of Misleading Zero Baselines for Point Metrics (`margin`, `returnRate`)
- **Issue & Trigger**: For percentage-point metrics (`margin` and `returnRate`), `compare()` was passed `points = true`. When prior sales or units were 0, the zero-baseline guard was bypassed, computing `+value pp` and rendering misleading statements like `"Previously 0% · +25 pp vs previous period"`.
- **Applied Resolution**:
  - In [`src/core/analytics/productPerformance.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/analytics/productPerformance.ts#L35-L66), added explicit denominator validation flags (`hasDenominator`, `oldHasDenominator`):
    - `currentHasSales = current.grossSales > 0`, `previousHasSales = Boolean(previous && previous.grossSales > 0)`
    - `currentHasUnits = current.soldQuantity > 0`, `previousHasUnits = Boolean(previous && previous.soldQuantity > 0)`
  - Guarded point comparisons:
    ```typescript
    if (points && (!hasDenominator || !oldHasDenominator)) {
      return { value, previous: oldHasDenominator ? old : null, change: null, kind, status: oldHasDenominator ? 'ZERO_BASELINE' : 'NO_BASELINE' }
    }
    ```
  - If the previous period had zero sales or zero units sold, margin and return rate return `status: 'NO_BASELINE'`, `previous: null`, and `change: null`.
- **Architecture Rationale**: Respects mathematical truth: a product with zero sales did not achieve 0% margin—its margin was undefined. Reporting percentage-point changes against non-existent baselines distorts commercial understanding.
- **Verification Reasoning**: Authored unit test in [`src/core/analytics/productPerformance.test.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/analytics/productPerformance.test.ts#L23-L33) asserts that comparing against a zero-sales prior period returns `status: 'NO_BASELINE'` and `change: null`.

---

### 6. Bounded Array Reduction in `comparisonObservationCutoff`
- **Issue & Trigger**: `Math.max(...ranges.map(...))` spread the entire range array into arguments, causing `RangeError: Maximum call stack size exceeded` in the Android WebView when sync ranges accumulated over time.
- **Applied Resolution**:
  - In [`src/core/analytics/productPerformance.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/analytics/productPerformance.ts#L89-L92), replaced the spread operator with stack-safe bounded iteration via `Array.prototype.reduce`:
    ```typescript
    const high = (ranges: readonly SyncRange[]) => ranges.reduce((max, range) => {
      const t = Date.parse(range.to)
      return Number.isFinite(t) && t > max ? t : max
    }, Number.NEGATIVE_INFINITY)
    ```
- **Architecture Rationale**: Eliminates stack-depth vulnerability on constrained mobile JS engines (V8/WebView), ensuring constant stack depth regardless of history length.
- **Verification Reasoning**: Authored unit test in [`src/core/analytics/productPerformance.test.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/analytics/productPerformance.test.ts#L41-L49) tests 1,000 continuous ranges without stack exhaustion.

---

### 7. Coalescence of Overlapping Recent Finance Jobs Preserving Pagination
- **Issue & Trigger**: Each sync run dynamically calculated `requestCutoff = Date.now() - 5 * 60000` and created a 3-day finance job with millisecond-differing IDs. Over multiple sync runs, `state.jobs` accumulated multiple overlapping finance queries rather than coalescing them.
- **Applied Resolution**:
  - In [`src/adapters/amazon-hosted/client.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-hosted/client.ts#L354-L362), inspected `state.jobs` for any existing recent finance job (`job.kind === 'finance' && job.to >= new Date(requestCutoff - 24 * 3600000).toISOString()`).
  - If found:
    - Retains its existing query boundaries and active continuation token (`job.nextToken`).
    - Updates its `scope = scope`.
    - If its upper boundary lags the new cutoff by more than 1 minute, enqueues only the uncovered tail (`from: existingRecentFinance.to, to: recentEnd`) as a new job, avoiding query re-execution or pagination disruption.
  - If no recent finance job exists: enqueues the 3-day window (`recentStart` to `recentEnd`).
- **Architecture Rationale**: Prevents job explosion and duplicate financial event fetching while honoring the strict Amazon SP-API rule that query parameters cannot change for requests holding a continuation token.
- **Verification Reasoning**: Inspection verifies that existing finance jobs are reused and only strictly non-overlapping subsequent windows are appended.

---

### 8. Priority `orderIds` Preservation and Deduplication in `LiveSync.merge`
- **Issue & Trigger**: In `LiveSync.java`, `merge(old, next)` merged `from`, `to`, `force`, and `requestIds`, but completely omitted `orderIds`. If a subsequent pull-to-refresh without priority IDs arrived while priority orders were pending, the pending `orderIds` were erased.
- **Applied Resolution**:
  - In [`android/app/src/main/java/in/azulia/seller/LiveSync.java`](file:///mnt/new-volume/Projects/azulia-seller-flow/android/app/src/main/java/in/azulia/seller/LiveSync.java#L53-L64), implemented union deduplication of `orderIds` across `old` and `next` using `java.util.HashSet<String>`, capped at the 250-ID limit (matching the API request boundary).
- **Architecture Rationale**: Ensures high-priority user-initiated order detail fetches are preserved through subsequent sync triggers and coalesced intents.
- **Verification Reasoning**: Java code inspection confirms that `result.put("orderIds", orderIds)` is populated from the union of both JSON inputs.

---

### 9. Multi-Observer Coordination and Polling Cancellation on Component Unmount
- **Issue & Trigger**: `PullToRefresh` had no mechanism to abort the 8-minute polling loop in `requestReportRefresh` when unmounted. Furthermore, sharing a single refresh promise across multiple callers risked premature cancellation of sibling observers or native service execution if one caller unmounted.
- **Applied Resolution**:
  - In [`src/adapters/amazon-report-sync/requestRefresh.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-report-sync/requestRefresh.ts#L7-L135), created `ActiveCoordination` with a `Set<Observer>`.
  - Added `signal?: AbortSignal` to `requestReportRefresh()`.
  - An individual observer aborting unregisters from `observers` and rejects its promise with an `AbortError`.
  - Sibling observers remain subscribed and continue receiving progress updates and completion outcomes.
  - The native background sync is NOT cancelled upon observer cancellation. If all observers unmount (`observers.size === 0`), the polling loop stops, freeing bridge bandwidth and WebView resources.
  - In [`src/components/PullToRefresh.tsx`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/components/PullToRefresh.tsx#L38-L53, #L78), created an `AbortController` in `refresh()` and passed its signal to `onRefresh`. On unmount or new pull, `activeController?.abort()` cleanly cancels observation.
  - In [`src/app/App.tsx`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/app/App.tsx#L571), forwarded `(onProgress, signal)` directly to `requestReportRefresh`.
- **Architecture Rationale**: Decouples UI observation lifecycle from durable background execution. Navigating away stops foreground polling without aborting the background sync running on Android.
- **Verification Reasoning**: Authored unit test in [`src/adapters/amazon-report-sync/requestRefresh.test.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-report-sync/requestRefresh.test.ts#L5-L34) asserts that aborting Observer A leaves Observer B uninterrupted until completion.

---

## Part 2: Minor & Observational Findings Resolution

### 10. Preserve `lane` on Existing Jobs in `appendJob`
- **Issue**: In [`src/adapters/amazon-hosted/client.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-hosted/client.ts#L286-L293), when an existing job matched `job.id`, `appendJob` updated `scope` but did not copy `lane`.
- **Applied Resolution**: Added `if (job.lane) old.lane = job.lane` to `appendJob`. This ensures lane designations (e.g. `'recent'`) persist across job re-evaluations.

### 11. Stale / Expired `requestStatus` Receipts Handling
- **Issue**: In [`android/app/src/main/java/in/azulia/seller/LiveSync.java`](file:///mnt/new-volume/Projects/azulia-seller-flow/android/app/src/main/java/in/azulia/seller/LiveSync.java#L88-L103), if `requestStatus()` could not find a request receipt in `SharedPreferences`, it defaulted to `"state": "queued"`. Polling clients would never time out or would assume a stale request was still pending.
- **Applied Resolution**:
  - Introduced `recentPending` map and `registerRequest()` helper.
  - In `DeviceBridge.java` (line 65), `registerRequest()` is called immediately upon `sync.request` before the main-thread post.
  - In `requestStatus()`, if the receipt is not yet in `SharedPreferences`, it checks `recentPending` for up to 15 seconds to allow for async dispatch delay. If expired or unrecognized, it returns `{"state": "unknown", "error": "Refresh request receipt expired or not found."}`, allowing clients to terminate polling and report failure promptly.

### 12. Cleanup of Dead `busy` Prop on `PullToRefresh`
- **Issue**: `busy: boolean` was declared on `Props` and passed from `App.tsx`, but was unused within `PullToRefresh.tsx` (the component tracks gesture state and promise resolution internally).
- **Applied Resolution**: Removed the dead `busy` prop from `PullToRefresh.tsx`, `App.tsx`, and `tests/fixtures/pullHarness.tsx`.

---

## Part 3: Regression Test Suite Summary

The following focused regression tests have been added to guard the implemented logic:

1. [`src/core/analytics/productPerformance.test.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/analytics/productPerformance.test.ts#L23-L49):
   - `suppresses margin and return rate point comparisons when denominators are zero or unrecorded`: Validates that zero prior gross sales or zero sold units emit `status: 'NO_BASELINE'`, `previous: null`, and `change: null` rather than false percentage-point differences.
   - `computes comparison observation cutoff with bounded reduce across large ranges without overflow`: Verifies stack-safe calculation across 1,000 sync ranges.
2. [`src/adapters/amazon-report-sync/requestRefresh.test.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-report-sync/requestRefresh.test.ts#L5-L34):
   - `allows one observer to abort without cancelling a coalesced sibling observer`: Validates multi-observer isolation and signal handling.

*(Note: Per task instructions, tests have not been executed).*

---

## Part 4: File Modification Index

| File | Changes |
| :--- | :--- |
| [`src/adapters/amazon-hosted/cache.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-hosted/cache.ts#L205-L209) | Atomic recent-orders watermark commit in same transaction as final page commit and job removal. |
| [`src/adapters/amazon-hosted/client.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-hosted/client.ts#L290, #L354-L362, #L497-L501, #L571-L595) | Coalesce finance jobs, remove duplicate watermark commit, lane preservation in `appendJob`, and accurate progress claiming on deadline. |
| [`src/core/analytics/productPerformance.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/analytics/productPerformance.ts#L35-L66, #L89-L92) | Zero-denominator baseline suppression for point metrics; bounded reduce for observation cutoff. |
| [`src/features/inventory/InventoryWorkspace.tsx`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/features/inventory/InventoryWorkspace.tsx#L15-L21, #L35) | Prefill saved physical stock count, validate input on save, and add explicit "Clear count" action. |
| [`android/app/src/main/java/in/azulia/seller/LiveSync.java`](file:///mnt/new-volume/Projects/azulia-seller-flow/android/app/src/main/java/in/azulia/seller/LiveSync.java#L13, #L53-L64, #L88-L103, #L106-L121, #L140-L157) | Static `QUEUE_LOCK`, atomic intent merge on cold start, deduplicated `orderIds` union, and `recentPending` request registration. |
| [`android/app/src/main/java/in/azulia/seller/DeviceBridge.java`](file:///mnt/new-volume/Projects/azulia-seller-flow/android/app/src/main/java/in/azulia/seller/DeviceBridge.java#L65) | Synchronous `registerRequest` call upon `sync.request` action. |
| [`src/adapters/amazon-report-sync/requestRefresh.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-report-sync/requestRefresh.ts#L7-L135) | Multi-observer coordination, `AbortSignal` support, observer unmount handling without cancelling background execution. |
| [`src/components/PullToRefresh.tsx`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/components/PullToRefresh.tsx#L3, #L38-L53, #L78) | Abort controller creation, signal forwarding to `onRefresh`, unmount cleanup, removal of unused `busy` prop. |
| [`src/app/App.tsx`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/app/App.tsx#L571) | Forwarding `(onProgress, signal)` to `requestReportRefresh`, removal of `busy` prop. |
| [`tests/fixtures/pullHarness.tsx`](file:///mnt/new-volume/Projects/azulia-seller-flow/tests/fixtures/pullHarness.tsx#L4) | Removed `busy` prop to match updated component interface. |
| [`src/core/analytics/productPerformance.test.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/analytics/productPerformance.test.ts) | Regression test cases for point-metric baseline suppression and bounded observation cutoff. |
| [`src/adapters/amazon-report-sync/requestRefresh.test.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-report-sync/requestRefresh.test.ts) | Regression test cases for multi-observer abort isolation. |
| [`docs/INTEGRATION_READY.md`](file:///mnt/new-volume/Projects/azulia-seller-flow/docs/INTEGRATION_READY.md) | Retained marked `NOT READY` per instructions. |
