# Return Recovery — Integration Specification for Codex

This document provides explicit instructions for integrating the return recovery modules into the application.

---

## 1. Search and Filtering Specification

Return recovery records support multi-field search and high-signal operational filtering via [`matchesRecoveryFilter`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/core/return-recovery/recoveryFilter.ts).

### Search Behavior
Search queries are trimmed, converted to lowercase, and matched as substrings against:
1. `orderId`: Exact or partial Amazon/Marketplace order ID (e.g. `402-1234567-8901234`).
2. `sku`: Seller SKU (e.g. `Trolly-22x9Inch-PO2-MFN`).
3. `asin`: 10-character Amazon Standard Identification Number (e.g. `B0GZNL9PY6`).
4. `productTitle`: Catalog product title.

### Filter Categories
- **`ALL`**: Shows all returned items.
- **`UNCONFIRMED`**: Returns awaiting physical warehouse inspection (`AWAITING_INSPECTION` or `overallStatus === 'PROVISIONAL'`).
- **`REPAIRABLE`**: Returns flagged as repairable / reconditionable, highlighting items with pending repair costs.
- **`DAMAGED_LOST`**: Returns with units marked `DAMAGED`, `LOST`, or `WRONG_OR_MISSING`.
- **`REIMBURSEMENT_REVIEW`**: High-priority claim candidate list:
  - Any return with `reimbursementClaimRecommended === true`.
  - Any courier loss (`LOST`) or customer switch fraud (`WRONG_OR_MISSING`).
  - Allows cross-referencing with Amazon reimbursement claims to ensure the seller files SAFE-T or courier claims.

---

## 2. Decoupled Storage Model

Manual warehouse inspection records must **never** be merged directly into raw Amazon source records or canonical financial event streams.

### Storage Key & Contract
- **Storage Target**:
  - Web: Local storage or IndexedDB table `returnInspections`.
  - Android / Desktop SQLite: Retained device workspace under `recovery-inspections:${sellerAccount}`.
- **Key**: Composite string from `stableRecoveryKey(identity)`:
  `${sellerAccount}:${marketplace}:${orderId}:${sku}`
- **Value**: JSON-serialized `ReturnInspectionRecord`:
  ```json
  {
    "identity": {
      "sellerAccount": "SELLER_1",
      "marketplace": "amazon.in",
      "orderId": "402-1234567-8901234",
      "sku": "SHIRT-BLU-L"
    },
    "returnedQuantity": 2,
    "dispositions": [
      {
        "id": "disp_1",
        "state": "SELLABLE",
        "quantity": 1,
        "recoveredValue": 250,
        "repairExpense": 0,
        "repairConfirmed": true,
        "notes": "Original packaging intact",
        "inspectedAt": "2026-11-14T10:00:00.000Z"
      },
      {
        "id": "disp_2",
        "state": "DAMAGED",
        "quantity": 1,
        "recoveredValue": 0,
        "repairExpense": 0,
        "repairConfirmed": true,
        "reimbursementClaimRecommended": true,
        "reimbursementClaimReason": "Item arrived crushed in transit",
        "inspectedAt": "2026-11-14T10:00:00.000Z"
      }
    ],
    "overallStatus": "CONFIRMED",
    "updatedAt": "2026-11-14T10:00:00.000Z",
    "version": 1
  }
  ```

---

## 3. Integration Plan for Codex

### Step 1: Hook into `ReturnAnalysis.tsx` or New "Return Recovery" View
In [`src/features/returns/ReturnAnalysis.tsx`](file:///mnt/new-volume/Projects/azulia-seller-flow/src/features/returns/ReturnAnalysis.tsx), add a sub-tab or view toggle:
```tsx
import {
  ReturnRecoveryTable,
  ReturnRecoverySummary,
  ReturnInspectionForm,
  type ReturnItemRowData,
} from '../return-recovery'
import '../return-recovery/returnRecovery.css'
```

### Step 2: Assemble Return Item Rows
Map the existing `ReturnOrderSummary` items to `ReturnItemRowData`:
```typescript
import {
  calculateRecoveryCost,
  calculateFinancialRecovery,
  summarizeRecoveryPortfolio,
} from '../../core/return-recovery'

// For each return order:
const identity = { sellerAccount, marketplace: 'amazon.in', orderId: order.orderId, sku: order.sku }
const inspection = savedInspections.get(stableRecoveryKey(identity))
const unitCost = costResolver.resolve(order.sku, order.date)

const recoveryCost = calculateRecoveryCost({
  identity,
  returnedQuantity: order.quantity,
  unitCost,
  inspection,
})

const financialResult = calculateFinancialRecovery({
  identity,
  financialNet: order.refundValue + order.marketplaceCharges + order.netShipping + order.reimbursements,
  consumedCost: unitCost !== null ? unitCost * order.quantity : null,
  recoveryCost,
})
```

### Step 3: Render Components
Render the pre-calculated summary and table:
```tsx
<ReturnRecoverySummary
  summary={portfolioSummary}
  activeTab={currentTab}
  onSelectTab={setCurrentTab}
/>

<ReturnRecoveryTable
  items={filteredItems}
  searchQuery={searchQuery}
  onSearchChange={setSearchQuery}
  onSelectInspect={item => setSelectedItem(item)}
/>

{selectedItem && (
  <ReturnInspectionForm
    identity={selectedItem.identity}
    returnedQuantity={selectedItem.returnedQuantity}
    unitCost={selectedItem.unitCost}
    productTitle={selectedItem.productTitle}
    productImage={selectedItem.productImage}
    returnDate={selectedItem.returnDate}
    currentInspection={selectedItem.inspection}
    onSave={saveInspection}
    onClose={() => setSelectedItem(null)}
  />
)}
```
