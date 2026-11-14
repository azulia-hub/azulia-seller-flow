# Return Recovery & Disposition Architecture

## 1. Executive Summary

Return recovery provides deterministic inventory and financial tracking for physical product returns. It Bridges the gap between marketplace accounting (which records customer refunds and marketplace charges) and warehouse reality (whether an item physically returned, its condition, and whether its cost can be recovered to asset inventory).

```text
MARKETPLACE ACTIVITY               WAREHOUSE INSPECTION              NET COMMERCIAL IMPACT
[ Amazon Refund / Fees ]  +  [ Physical Return Condition ]   =   [ True Effective Net Profit ]
(Already in financialNet)     (SELLABLE / REPAIR / LOSS)           (After recovery & repairs)
```

---

## 2. Core Domain Principles

### A. Identity & Tenancy
Return recovery records are uniquely identified by a composite multi-tenant key:
`sellerAccount` + `marketplace` + `orderId` + `sku` (+ `orderItemId` if present).

### B. Physical Return Disposition States
1. `AWAITING_INSPECTION`: Default state. Item return requested/reported by marketplace, but warehouse has not physically inspected it.
2. `SELLABLE`: Item returned in unopened/good condition. Restored to active resellable inventory.
3. `REPAIRABLE`: Item returned with minor defect/opened packaging. Can be restored after repair/reconditioning expense.
4. `DAMAGED`: Item returned broken, scrap, or unsellable. May carry explicit salvage value.
5. `WRONG_OR_MISSING`: Customer returned a switch/wrong item or empty box.
6. `LOST`: Courier/logistics lost the return package in transit.

### C. Cost Recovery Invariants
1. **Provisional Invariant**:
   While physical inspection is unconfirmed (`AWAITING_INSPECTION` or partial), the original consumed product cost remains in effect. Inventory value is not credited until confirmed.
2. **Applicable Cost Cap**:
   `applicableCost = unitCost * returnedQuantity`.
   A return can never restore more quantity or monetary value than the original applicable consumed cost. Any excessive user entry is clamped to `applicableCost`.
3. **Sellable Restoration**:
   `SELLABLE` units restore the applicable unit cost (`unitCost * quantity`) unless an explicit lower value is specified.
4. **Repairable Cost & Expense**:
   `REPAIRABLE` units restore asset inventory value (up to applicable cost), but incur an explicit repair expense.
5. **No Silent Zero Repair Assumption**:
   Repair expense must be explicitly confirmed (either an explicit amount or an explicit confirmation of ₹0). Blank or unconfirmed repair expense yields status `UNCONFIRMED_REPAIR` and `PROVISIONAL`.

---

## 3. Financial Integration & Math

### A. Financial Net Invariant
The input `financialNet` is the cumulative sum of marketplace financial activity already parsed from source reports or SP-API:
```text
financialNet = Gross Sales + Customer Refunds + Commission Credits + Shipping Fees + Reimbursements
```
> [!IMPORTANT]
> **Never double-count reimbursements**: Amazon SAFE-T, lost-in-transit, or customer return reimbursements already exist in `financialNet`. Return recovery does not manufacture financial events or re-add reimbursements.

### B. Formula
```text
effectiveNetProfit = financialNet - consumedCost + confirmedRecoveredCost - repairExpense
```

Where:
- `financialNet`: Realized marketplace net.
- `consumedCost`: Original unit cost × returned quantity (`null` if cost is unconfigured).
- `confirmedRecoveredCost`: Confirmed inventory asset value restored.
- `repairExpense`: Confirmed operating repair expense incurred.

### C. Status Hierarchy
1. `MISSING_COST`: `consumedCost` is `null`. Effective profit cannot be calculated.
2. `UNCONFIRMED_REPAIR`: Item is `REPAIRABLE` but repair expense is pending/unconfirmed.
3. `PROVISIONAL`: Some or all returned units await physical inspection.
4. `CONFIRMED`: All returned units inspected and all financial inputs confirmed.

---

## 4. Separation of Concerns & Clean Architecture

- `src/core/return-recovery/`:
  - Pure deterministic TypeScript.
  - No React, DOM, ECharts, Dexie, or marketplace-specific libraries.
  - Independently testable.
- `src/features/return-recovery/`:
  - Declarative presentational React components.
  - Supplied props and callbacks only; zero business calculations in UI.
  - Mobile-first responsive CSS with touch targets >= 44px.
- **Storage Isolation**:
  - Inspection records are stored in a dedicated user-overrides store (e.g. `recovery-inspections:${account}`).
  - Amazon source reports and SP-API caches remain completely untouched.
