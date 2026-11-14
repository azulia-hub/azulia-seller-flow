# Source Code Review & Verification: Return Recovery & Review Requests

**Date**: 2026-11-14  
**Scope**: Independent source code audit of Return Recovery and Review Requests modules.  
**Review Target**:
1. Return Recovery core domain and UI (`src/core/return-recovery/`, `src/features/return-recovery/`)
2. Review Requests core domain, adapters, and UI (`src/core/review-requests/`, `src/adapters/amazon-reviews/`, `src/features/review-requests/`, `DeviceBridge.java`, `server/local/server.ts`)

---

## 1. Return Recovery Review Findings

### 1.1 Inspection Form Defaults New Returns to SELLABLE
- **Severity**: High (Data Integrity & Financial Risk)
- **File / Line**: [`src/features/return-recovery/ReturnInspectionForm.tsx#L74-L88`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/features/return-recovery/ReturnInspectionForm.tsx#L74-L88)
- **Source Evidence**:
  When `drafts` state initializes for a return item without an existing inspection, lines 75–87 explicitly pre-populate:
  ```typescript
  return [{
    id: 'disp_1',
    state: 'SELLABLE',
    quantity: String(returnedQuantity),
    recoveredValue: unitCost !== null ? String(unitCost * returnedQuantity) : '',
    useUnitCost: unitCost !== null,
    ...
  }]
  ```
- **Consequence**: When an uninspected return is opened in the modal, it immediately defaults to 100% sellable condition with full cost recovery. If a seller opens the modal and taps "Save Inspection" without deliberate evaluation, damaged, lost, or swapped items are erroneously recorded as sellable inventory, artificially inflating profit.
- **Resolution**: Initialize default draft state to `'AWAITING_INSPECTION'` (or require explicit condition selection). Prevent confirming a return as sellable without an intentional user action.

---

### 1.2 Core Calculator Rounds Invalid Quantities and Bypasses Validation
- **Severity**: High (Safety Invariant Violation)
- **File / Line**: [`src/core/return-recovery/recoveryModel.ts#L130`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/return-recovery/recoveryModel.ts#L130) and [`#L159`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/return-recovery/recoveryModel.ts#L159)
- **Source Evidence**:
  In `calculateRecoveryCost`:
  ```typescript
  const returnedQuantity = Math.max(0, Math.round(input.returnedQuantity))
  // ...
  const qty = Math.max(0, Math.round(disp.quantity))
  ```
- **Consequence**: If an invalid quantity (`-1`, `0`, `NaN`, fractional numbers, or non-finite inputs) is supplied, `calculateRecoveryCost` silently coerces it to `0` or a rounded integer. It never calls or enforces `validateDispositions()`, allowing corrupt or invalid data to generate provisional or confirmed calculations without error.
- **Resolution**: Enforce strict validation inside `calculateRecoveryCost`. Non-positive, non-integer, or non-finite returned quantities or disposition quantities must throw an explicit `TypeError` / `RangeError` or return an invalid result state rather than silently coercing.

---

### 1.3 Inspection Identity Is Not Checked Against Calculation Identity
- **Severity**: High (Tenant & Object Isolation)
- **File / Line**: [`src/core/return-recovery/recoveryModel.ts#L129-L136`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/return-recovery/recoveryModel.ts#L129-L136)
- **Source Evidence**:
  `calculateRecoveryCost(input)` receives `input.identity` and optional `input.inspection`. However, it never compares `input.identity` against `input.inspection.identity`:
  ```typescript
  const dispositions = input.inspection?.dispositions ?? []
  ```
- **Consequence**: If an inspection record belonging to a different order or SKU is passed to `calculateRecoveryCost`, the engine processes that foreign inspection's dispositions under the current identity.
- **Resolution**: Assert that if `input.inspection` is provided, `input.inspection.identity.sellerAccount === input.identity.sellerAccount && input.inspection.identity.orderId === input.identity.orderId && input.inspection.identity.sku === input.identity.sku`. Throw a descriptive mismatch error if they diverge.

---

### 1.4 Colon-Separated Identity Keys Collide with Valid SKU Content
- **Severity**: Medium-High (Key Collision & Data Corruption)
- **File / Line**: [`src/core/return-recovery/recoveryModel.ts#L17-L35`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/return-recovery/recoveryModel.ts#L17-L35)
- **Source Evidence**:
  ```typescript
  export function stableRecoveryKey(identity: ReturnItemIdentity): string {
    const base = `${identity.sellerAccount}:${identity.marketplace}:${identity.orderId}:${identity.sku}`
    return identity.orderItemId ? `${base}:${identity.orderItemId}` : base
  }
  export function parseRecoveryKey(key: string): ReturnItemIdentity | null {
    const parts = key.split(':')
    // ...
  }
  ```
- **Consequence**: SKUs in Amazon India and marketplace catalogs frequently contain colons (e.g. `Trolly:22x9:PO2` or `BUNDLE:SET:2`). When parsed via `key.split(':')`, the SKU is fractured across `parts[3]`, `parts[4]`, etc. This corrupts `sku` and misidentifies `orderItemId`.
- **Resolution**: Use collision-safe encoding (e.g. URI component encoding / escape sequences for colons, or JSON encoding) for composite keys, with backward-compatible migration for existing keys without colons.

---

### 1.5 Repair Expenses May Be Ignored or Cleared When Condition Changes to SELLABLE
- **Severity**: High (Financial Under-Reporting of Costs)
- **File / Line**: [`src/features/return-recovery/ReturnInspectionForm.tsx#L155`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/features/return-recovery/ReturnInspectionForm.tsx#L155) and [`src/core/return-recovery/recoveryModel.ts#L168-L184`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/return-recovery/recoveryModel.ts#L168-L184)
- **Source Evidence**:
  1. In `ReturnInspectionForm.tsx`, when `newState === 'SELLABLE'`, `repairExpense` is cleared to `''` and `noRepairCost` is reset to `false`.
  2. In `recoveryModel.ts`, under `switch (disp.state)`, case `'SELLABLE'` only computes recovered value and completely ignores any recorded `disp.repairExpense`.
- **Consequence**: When an item is reconditioned or repaired (e.g. ₹20 spent on parts/packaging) to return it to sellable condition, marking the final condition as `SELLABLE` obliterates the ₹20 repair expense. In core calculations, the repair expense is omitted from `totalRepairExpense`, overstating profit by the repair amount.
- **Resolution**: Preserve repair expenses independently of disposition condition. If a repair expense is recorded, count it in `totalRepairExpense` regardless of whether the final restored condition is sellable or refurbished.

---

### 1.6 Financial Calculation Accepts Potentially Inconsistent Identity/Cost Inputs
- **Severity**: High (Financial Invariant Breach)
- **File / Line**: [`src/core/return-recovery/financialRecovery.ts#L33-L65`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/return-recovery/financialRecovery.ts#L33-L65)
- **Source Evidence**:
  In `calculateFinancialRecovery(input)`:
  ```typescript
  const { financialNet, consumedCost, recoveryCost } = input
  const { confirmedRecoveredCost, totalRepairExpense, ... } = recoveryCost
  // ...
  if (consumedCost !== null && repairExpenseConfirmed) {
    effectiveNetProfit = round(financialNet - consumedCost + confirmedRecoveredCost - totalRepairExpense)
  }
  ```
- **Consequence**:
  1. `input.identity` is not validated against `recoveryCost.identity`.
  2. `confirmedRecoveredCost` is not clamped against `consumedCost`. If an inconsistent `recoveryCost` is passed where `confirmedRecoveredCost > consumedCost`, the calculation produces `confirmedRecoveredCost - consumedCost > 0`, manufacturing phantom profit.
- **Resolution**: Verify that `input.identity` matches `recoveryCost.identity`. Clamp `confirmedRecoveredCost` to `Math.min(confirmedRecoveredCost, consumedCost)` when `consumedCost !== null`.

---

## 2. Review Requests Review Findings

### 2.1 12-Second Budget Exhaustion After Claiming Order in `runReviewCycle`
- **Severity**: High (Stalled Review State)
- **File / Line**: [`src/adapters/amazon-reviews/service.ts#L38-L55`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-reviews/service.ts#L38-L55)
- **Source Evidence**:
  In `runReviewCycle`, `abort = AbortSignal.timeout(12000)` is created. For each candidate order, it calls `checkReview(..., abort)` (running `transport.order` and `transport.eligible`), and then calls `sendReview(..., abort)`. Inside `sendReview` at line 38:
  ```typescript
  const checked = await checkReview(storage, context, id, transport, signal)
  ```
  It repeats the entire verification and eligibility check with the same decaying 12-second abort signal!
  At line 42, it claims `state = 'sending'`. If the 12-second timeout expires during preparation or dispatch, the catch block marks the record:
  ```typescript
  value.records[id] = { ...value.records[id], state: 'uncertain', reason: 'Amazon acceptance was not confirmed. Do not resend blindly; verify in Seller Central.' }
  ```
- **Consequence**: Orders that were never sent to Amazon get trapped in `state: 'uncertain'` purely because the preparation timeout expired after claiming the record.
- **Resolution**: Eliminate redundant `checkReview` calls inside `sendReview`. If a preparation step (like claim or storage write) fails or times out *before* the network submission is dispatched, revert the attempt or mark it as failed/ready rather than marking it as a dispatched/uncertain submission.

---

### 2.2 Automation Consent and Replacement Exclusion Not Rechecked at Dispatch Boundary
- **Severity**: High (Policy Violation / Unintended Solicitations)
- **File / Line**: [`android/app/src/main/java/in/azulia/seller/DeviceBridge.java#L72-L78`](file:///mnt/new-volume/Projects/azulia-seller-flow/android/app/src/main/java/in/azulia/seller/DeviceBridge.java#L72-L78) and [`server/local/server.ts#L68-L71`](file:///mnt/new-volume/Projects/azulia-seller-flow/server/local/server.ts#L68-L71)
- **Source Evidence**:
  In `DeviceBridge.java`:
  ```java
  case "reviews.submit": {
      // ...
      claim.put("state", "dispatched");
      database.retain(key, claim);
      return session.solicit(id);
  }
  ```
  Neither `DeviceBridge.java` nor `server/local/server.ts` rechecks:
  1. Whether `claim.source === 'automatic'` and whether `reviews-config` still has `autoEnabled === true`.
  2. Whether the order is in `reviews.blocked` (excluded replacement chain).
  3. Whether the account in session matches the claim.
- **Consequence**: If a user disables automatic review requests or if an order is flagged as a replacement chain while an attempt is prepared, the native/server dispatcher blindly sends the review anyway.
- **Resolution**: Recheck current consent (`autoEnabled`), account matching, and replacement chain exclusion immediately at the dispatch boundary before issuing the HTTP POST to Amazon.

---

### 2.3 Stale Scan (Up to 15 Minutes Old) Missing Newly Created Replacements
- **Severity**: Medium-High (Customer Experience / Policy Violation)
- **File / Line**: [`src/adapters/amazon-reviews/service.ts#L37`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/adapters/amazon-reviews/service.ts#L37)
- **Source Evidence**:
  Line 37 checks:
  ```typescript
  if(!context.freshOrdersAt||!Number.isFinite(Date.parse(context.freshOrdersAt))||Date.now()-Date.parse(context.freshOrdersAt)>15*60000)
    throw new Error('Refresh recent orders before sending, so known replacement orders can be excluded.')
  ```
- **Consequence**: Amazon SP-API `GET /orders/v0/orders/{orderId}` only indicates if *that* order is a replacement (`IsReplacementOrder`). It does *not* indicate whether that order was *subsequently replaced* by a new order (which holds `ReplacedOrderId = id`). If recent orders have not been refreshed recently, newly created replacement orders in the chain are missed, and a review request is sent to an unhappy buyer who requested a replacement.
- **Resolution**: Tighten the recent orders threshold, check the order's latest status, and hold uncertain cases where order history is not freshly verified.

---

### 2.4 Account Switch During Asynchronous Context Lookup Associating Actions with Wrong Account
- **Severity**: High (Cross-Account Contamination)
- **File / Line**: [`src/features/review-requests/ReviewContext.tsx#L31-L34`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/features/review-requests/ReviewContext.tsx#L31-L34)
- **Source Evidence**:
  In `ReviewContext.tsx`:
  ```typescript
  async function act(id: string, send: boolean) {
    // ...
    const owner = current.current.account;
    try {
      const value = await context();
  ```
  `context()` calls `await nativeRequest('sync.status')` on Android.
  If the user switches accounts in the UI while `nativeRequest` is awaiting, `current.current.account` mutates to the new account. `context()` reads `current.current.account` and returns the *new* account, while `owner` was the *old* account. `markExternal` has no owner check at all.
- **Consequence**: The action can execute against the new seller account using the old account's order ID and credentials.
- **Resolution**: Capture the account ID synchronously at the entry of `act` and `markExternal`. Pass `owner` to `context(owner)` and throw immediately if the active account changes during async processing.

---

## 3. Review Summary & Next Steps

All 10 findings have been independently verified against the source code.
In Phase 2, we will implement full corrections across both domains, integrate Return Recovery with durable storage and financial calculations, author focused regressions, run builds, and commit/push.
