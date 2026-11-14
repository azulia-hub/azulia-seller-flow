# Return Recovery Modules — Handoff to Codex

**Date**: 2026-11-14  
**Scope**: Pure deterministic return recovery domain, presentational UI components, regression tests, and integration specifications.  
**Write Boundary Compliance**: All files were created strictly within the authorized scope (`src/core/return-recovery/`, `src/features/return-recovery/`, `docs/return-recovery/`). Zero existing shared files were modified.  
**Status**: Implementation complete and self-contained. In accordance with strict user constraints, tests and builds were **not executed** and no runtime claims are made.

---

## 1. Inventory of Created Files

### A. Core Return Recovery Domain (`src/core/return-recovery/`)

1. **[`src/core/return-recovery/types.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/return-recovery/types.ts)**:
   - `ReturnItemConditionState`: `'AWAITING_INSPECTION' | 'SELLABLE' | 'REPAIRABLE' | 'DAMAGED' | 'WRONG_OR_MISSING' | 'LOST'`.
   - `OverallRecoveryStatus`: `'PROVISIONAL' | 'CONFIRMED'`.
   - `RecoveryFinancialStatus`: `'CONFIRMED' | 'PROVISIONAL' | 'MISSING_COST' | 'UNCONFIRMED_REPAIR'`.
   - `ReturnItemIdentity`: Multi-tenant key (`sellerAccount`, `marketplace`, `orderId`, `sku`, `orderItemId`).
   - `ReturnItemDisposition`: Granular condition entry supporting partial quantities, explicit recovered value, repair expense, repair confirmation, and claim recommendations.
   - `ReturnInspectionRecord`: User inspection record decoupled from source data.
   - `RecoveryCalculationInput`, `RecoveryCostResult`, `FinancialRecoveryInput`, `FinancialRecoveryResult`, `ReturnRecoveryFilterSpec`.

2. **[`src/core/return-recovery/recoveryModel.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/return-recovery/recoveryModel.ts)**:
   - `stableRecoveryKey(identity)` & `parseRecoveryKey(key)`: Deterministic composite identity string generation.
   - `createDefaultInspection(identity, returnedQuantity)`: Generates initial uninspected record.
   - `validateDispositions(returnedQuantity, dispositions)`: Validates positive integer quantities, total quantity ceiling, and non-negative values.
   - `calculateRecoveryCost(input)`: Deterministic cost calculation enforcing:
     - Provisional retention of original consumed cost until recovery is confirmed.
     - Restoration of applicable cost for sellable units.
     - Strict value capping: never recover more quantity or monetary value than original applicable cost (`unitCost * returnedQuantity`).
     - Required repair expense confirmation.

3. **[`src/core/return-recovery/financialRecovery.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/return-recovery/financialRecovery.ts)**:
   - `calculateFinancialRecovery(input)`:
     - Implements formula: `effectiveNetProfit = financialNet - consumedCost + confirmedRecoveredCost - repairExpense`.
     - Invariant: `financialNet` already includes Amazon refunds, fees, and reimbursements; never manufactures synthetic financial events or double-counts reimbursements.
     - Preserves explicit missing-cost (`MISSING_COST`) and unconfirmed-repair (`UNCONFIRMED_REPAIR`) statuses.
     - Returns explicit `RecoveryAdjustments` (`inventoryRecoveryAdjustment`, `repairExpenseAdjustment`, `netCostImpact`).
   - `summarizeRecoveryPortfolio(results)`: Computes portfolio-level aggregates across all return items.

4. **[`src/core/return-recovery/recoveryFilter.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/return-recovery/recoveryFilter.ts)**:
   - `matchesRecoveryFilter(item, spec)` & `filterRecoveryItems(items, spec)`: Pure filter engine matching substring queries across `orderId`, `sku`, `asin`, and `productTitle`, and categorizing by operational statuses (`UNCONFIRMED`, `REPAIRABLE`, `DAMAGED_LOST`, `REIMBURSEMENT_REVIEW`).

5. **[`src/core/return-recovery/recoveryModel.test.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/return-recovery/recoveryModel.test.ts)**:
   - Focused regression tests for disposition validation, applicable cost clamping, partial quantities, sellable restoration, and repair confirmation (authored, unexecuted).

6. **[`src/core/return-recovery/financialRecovery.test.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/return-recovery/financialRecovery.test.ts)**:
   - Focused regression tests for net recovery formulas, reimbursement non-duplication, missing cost handling, unconfirmed repair expense, portfolio summary, and multi-field filters (authored, unexecuted).

7. **[`src/core/return-recovery/index.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/return-recovery/index.ts)**:
   - Clean domain barrel export.

---

### B. Presentational UI Components (`src/features/return-recovery/`)

1. **[`src/features/return-recovery/ReturnRecoveryBadge.tsx`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/features/return-recovery/ReturnRecoveryBadge.tsx)**:
   - `ReturnItemStateBadge`: Color-coded accessible badges for physical condition states.
   - `RecoveryStatusBadge`: Badges for overall confirmation and financial status.

2. **[`src/features/return-recovery/ReturnInspectionForm.tsx`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/features/return-recovery/ReturnInspectionForm.tsx)**:
   - Presentational mobile-friendly inspection modal.
   - Supplied props and callbacks only; zero business calculations in React.
   - Full support for partial quantities with dynamic disposition rows.
   - Explicit "No repair expense incurred (₹0)" confirmation requirement; prevents silently assuming unknown repair expense is zero.
   - Allows flagging for Amazon SAFE-T / courier claims with reason notes.

3. **[`src/features/return-recovery/ReturnRecoverySummary.tsx`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/features/return-recovery/ReturnRecoverySummary.tsx)**:
   - Mobile-friendly KPI cards (Return Items, Recovered Value, Repair Expenses, Net Recovery Profit).
   - Category filter tabs (`All`, `Awaiting / Provisional`, `Repairable`, `Damaged & Lost`, `SAFE-T / Claim Review`).

4. **[`src/features/return-recovery/ReturnRecoveryItemCard.tsx`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/features/return-recovery/ReturnRecoveryItemCard.tsx)**:
   - Mobile-first card showing individual return order details, physical condition breakdown, financial strip, and inspection action.

5. **[`src/features/return-recovery/ReturnRecoveryTable.tsx`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/features/return-recovery/ReturnRecoveryTable.tsx)**:
   - Responsive list/table switching automatically between desktop data table and mobile stacked cards.
   - Integrated search bar and count indicator.

6. **[`src/features/return-recovery/returnRecovery.css`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/features/return-recovery/returnRecovery.css)**:
   - Scoped responsive styles adhering to system design variables (`--bg`, `--panel`, `--text`, `--muted`, `--border`, `--accent`, `--positive`, `--negative`, `--warning`).
   - Touch targets >= 44px on mobile devices.

7. **[`src/features/return-recovery/index.ts`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/features/return-recovery/index.ts)**:
   - Feature barrel export.

---

### C. Documentation (`docs/return-recovery/`)

1. **[`docs/return-recovery/ARCHITECTURE.md`](file:///mnt/new-volume/Projects/azulia-seller-flow/docs/return-recovery/ARCHITECTURE.md)**:
   - Explains the domain model, condition states, applicable cost capping, non-duplication of reimbursements, and clean layer separation.
2. **[`docs/return-recovery/INTEGRATION_SPEC.md`](file:///mnt/new-volume/Projects/azulia-seller-flow/docs/return-recovery/INTEGRATION_SPEC.md)**:
   - Details search specs, filter criteria, decoupled persistence keys, and step-by-step wiring instructions for Codex.
3. **[`docs/return-recovery/HANDOFF.md`](file:///mnt/new-volume/Projects/azulia-seller-flow/docs/return-recovery/HANDOFF.md)**:
   - This handoff report.

---

## 2. Core Architectural Invariants Maintained

| Invariant | Implementation Mechanism |
| :--- | :--- |
| **Pure TypeScript Core** | `src/core/return-recovery/` has 0 dependencies on React, ECharts, DOM, Dexie, or DuckDB. |
| **Separation of Concerns** | React components perform zero business calculations; they receive pre-computed models and invoke callbacks. |
| **No Re-Adding Reimbursements** | `financialNet` already includes Amazon refunds and reimbursements. Recovery only computes inventory restoration and repair adjustments. |
| **No Manufactured Financial Events** | Adjustments are explicit returned data structures, not synthetic CSV rows or dummy ledger transactions. |
| **Applicable Cost Ceiling** | Total recovered value can never exceed original applicable consumed cost (`unitCost * returnedQuantity`). |
| **Explicit Repair Expense** | Repair expense requires explicit numeric input or explicit confirmation of ₹0; unknown repair expense is never silently treated as 0. |
| **Data Decoupling** | Manual inspection records are keyed by composite ID and stored independently from Amazon source sync data. |

---

## 3. Recommended Codex Integration Steps

When Codex completes the review-request automation work:
1. **Persistence Setup**:
   Store inspection records under key `recovery-inspections:${account}` in the device workspace or browser IndexedDB table `returnInspections`.
2. **Assemble View Model**:
   Iterate over return order summaries, resolve unit costs via `createProductCostResolver`, compute recovery costs using `calculateRecoveryCost`, and derive financial outcomes via `calculateFinancialRecovery`.
3. **Render in UI**:
   Import `ReturnRecoverySummary`, `ReturnRecoveryTable`, and `ReturnInspectionForm` from `src/features/return-recovery` into [`src/features/returns/ReturnAnalysis.tsx`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/features/returns/ReturnAnalysis.tsx) or a dedicated sub-view.
