# Advertising Workspace UI Implementation Result

Codex integration update (2026-11-20): this presentation handoff has now been
reviewed and connected to real application selectors, persistent groups and live
desktop reports. See [ADVERTISING_INTEGRATION_RESULT.md](ADVERTISING_INTEGRATION_RESULT.md)
for corrections, current validation, native package and remaining capabilities.
The original handoff below is retained as Antigravity's delivery record.

## Status
`READY_FOR_CODEX_INTEGRATION`

---

## 1. Executive Summary

In accordance with [AGENTS.md](file:///mnt/new-volume/Projects/azulia-seller-flow/AGENTS.md), [docs/ADVERTISING_WORKSPACE_PROPOSAL.md](file:///mnt/new-volume/Projects/azulia-seller-flow/docs/ADVERTISING_WORKSPACE_PROPOSAL.md), and [docs/ADVERTISING_PARALLEL_HANDOFF.md](file:///mnt/new-volume/Projects/azulia-seller-flow/docs/ADVERTISING_PARALLEL_HANDOFF.md), the presentation layer for the new Advertising Workspace has been constructed.

The implementation is strictly presentation-only. It honors all ownership boundaries:
- **Zero calculations in React**: UI renders precomputed measures, ratios, deltas, coverage statuses, and model findings. No attribution, tax, or financial aggregation logic exists in the UI.
- **Strict path boundaries**: All presentation code and styles reside exclusively in `src/features/advertising-workspace/ui/`. No files in `core/`, `adapters/`, `server/`, `android/`, `src/app/`, or `contract.ts` were modified.
- **Isolated test harness**: Visual tests and fixtures live solely under `tests/fixtures/` and `tests/e2e/`, completely segregated from production bundles.
- **Responsive & Accessible**: Verified across mobile (375px) and desktop (1280px) viewports with zero horizontal document overflow, touch-accessible controls, and keyboard navigation.

---

## 2. Deliverables & Created Files

### Exported Entry Component
- **Path**: `src/features/advertising-workspace/ui/AdvertisingWorkspaceView.tsx`
- **Component Signature**:
  ```tsx
  export function AdvertisingWorkspaceView(props: AdvertisingWorkspaceViewProps): JSX.Element
  ```
- **Type Contract**: Directly consumes `AdvertisingWorkspaceViewProps` from `src/features/advertising-workspace/contract.ts`.

### Component Manifest
All files reside in [src/features/advertising-workspace/ui/](file:///mnt/new-volume/Projects/azulia-seller-flow/src/features/advertising-workspace/ui/):

1. **`AdvertisingWorkspaceView.tsx`**:
   Root container managing view state (Overview, Campaigns, Products, Search terms), date range pickers, scope selectors (Account, Product, Group), data freshness/coverage warning banners, and orchestration of the detail drawer and group editor modal.
2. **`OverviewView.tsx`**:
   Top-level dashboard displaying KPI summary cards, up to 3 prioritized review/data-quality findings, interactive SVG trend chart, and high-impact campaigns preview.
3. **`CampaignsView.tsx`**:
   Full campaign table with text search, multi-column sorting (Spend, Sales, ACOS, ROAS, Purchases), status badges, delta comparisons, review notice tags, and pagination.
4. **`ProductsView.tsx`**:
   Product performance table showing financial revenue join policies, direct vs total revenue, TACOS, advertising profit impact, and catalog drilldown links via `onOpenFinancialProduct`.
5. **`SearchTermsView.tsx`**:
   Search queries table displaying direct vs shared ad-group attribution badges, CTR, CPC, conversion rates, and spend-to-revenue efficiency.
6. **`SummaryCards.tsx`**:
   Primary 5-card metric row (`spend`, `attributedSales`, `acos`, `roas`, `tacos`) featuring definition disclosures, unavailable reason tags, and favorable/unfavorable deltas.
7. **`FindingsSection.tsx`**:
   Review findings card supporting `REVIEW` and `DATA_QUALITY` categories with evidence bullets and "View evidence" callback integration.
8. **`TrendChart.tsx`**:
   Accessible SVG trend visualization supporting Spend/Sales, Efficiency, and Traffic modes, with interactive date tooltips and an accessible table fallback.
9. **`EntityDetailView.tsx`**:
   Slide-over detail drawer supporting dynamic entity scopes (`campaign`, `product`, `group`, `searchTerm`). Renders sections declared by `model.detail.availableSections`, including Targets & bids (with bid source badges: `DIRECT`, `AD_GROUP_DEFAULT`, `INHERITED`) and Cross-sales attribution (advertised vs purchased SKU flow, sibling badges, attribution notes).
10. **`GroupEditorModal.tsx`**:
    Accessible dialog modal for creating and editing manual product groups, featuring product search, multi-item selection checkboxes, and `onSaveGroup` callback.
11. **`formatters.ts`**:
    Pure presentation helpers for currency, percentages, multipliers, integers, and delta indicators.
12. **`advertisingWorkspace.css`**:
    Scoped styling strictly under `.adsw-root` preserving ivory/charcoal/gold branding, responsive table containers, dark/light theme support, and `prefers-reduced-motion` compliance.

### Test Harness & Specs
- `tests/fixtures/advertisingWorkspaceHarness.html`: Standalone mount page for visual/integration testing.
- `tests/fixtures/advertisingWorkspaceHarness.tsx`: Interactive test harness supplying rich, representative fixture states (Overview, Campaigns, Products, Search terms, Drawer details, Targets & bids, Cross-sales, Error/Coverage banners).
- `tests/e2e/advertising-workspace-ui.spec.ts`: Comprehensive 10-test suite executed against headless Chromium.

---

## 3. Validation & Test Evidence

### A. TypeScript Typecheck
- **Command**: `npm run typecheck`
- **Result**: **PASS** (0 errors). Whole-repository and server configs validated cleanly.

### B. Production Build Bundle
- **Command**: `npm run build`
- **Result**: **PASS** (Vite build and desktop engine completed in 6.13s with zero errors).

### C. Core Advertising Workspace Unit Tests
- **Command**: `npx vitest run src/core/advertising/workspace.test.ts src/core/advertising/workspaceFinancial.test.ts`
- **Result**: **PASS** (2/2 test files passed, 6/6 tests passed in 354ms).

### D. Playwright Focused UI Checks (Mobile & Desktop)
- **Command**: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test tests/e2e/advertising-workspace-ui.spec.ts`
- **Result**: **10 / 10 PASSED** in 19.3s.

#### Test Breakdown:
1. `Advertising Workspace UI at 375px › renders primary context, KPIs and responsive layout without horizontal overflow` — **PASS**
   - Verified viewport 375x667.
   - Asserted `document.documentElement.scrollWidth <= 375` (zero page overflow).
   - Verified touch targets, card stacking, and banner visibility.
2. `Advertising Workspace UI at 375px › navigates across available view tabs: Overview, Campaigns, Products, Search terms` — **PASS**
   - Verified tab selection, query callback triggers, and table rendering on mobile.
3. `Advertising Workspace UI at 375px › opens entity detail drawer with targets, cross-sales and navigates back` — **PASS**
   - Verified detail drawer slides open, displays configured bids and cross-sale evidence, and cleanly navigates back via "Back to workspace".
4. `Advertising Workspace UI at 375px › supports custom group creation through accessible modal` — **PASS**
   - Verified opening group modal, filtering products, selecting checkboxes, and firing `onSaveGroup` with correct payload.
5. `Advertising Workspace UI at 375px › supports scope switching and refresh / settings callbacks` — **PASS**
   - Verified scope selector dropdown switches from Account to Product/Group, and Refresh triggers `onRefresh`.
6. `Advertising Workspace UI at 1280px › renders primary context, KPIs and responsive layout without horizontal overflow` — **PASS**
   - Verified desktop widescreen layout, 5-column metric grid, findings card, and top campaign preview.
7. `Advertising Workspace UI at 1280px › navigates across available view tabs: Overview, Campaigns, Products, Search terms` — **PASS**
   - Verified desktop tabular layouts for Campaigns, Products, and Search terms.
8. `Advertising Workspace UI at 1280px › opens entity detail drawer with targets, cross-sales and navigates back` — **PASS**
   - Verified desktop drawer presentation, section switching (Summary, Targets, Cross-sales), and financial product drilldown trigger (`onOpenFinancialProduct`).
9. `Advertising Workspace UI at 1280px › supports custom group creation through accessible modal` — **PASS**
   - Verified desktop modal accessibility, focus management, and group persistence trigger.
10. `Advertising Workspace UI at 1280px › supports scope switching and refresh / settings callbacks` — **PASS**
    - Verified scope and filter controls dispatch specification patches to `onQueryChange`.

---

## 4. Contract Assumptions & Conformance

1. **Model Source of Truth**: The UI component does not maintain internal query caches or mutate metrics. User selections (date changes, search queries, sort columns, view switches, pagination) are dispatched to `onQueryChange(patch)` as declarative specs.
2. **Dynamic View Availability**: The tabs rendered strictly mirror `model.availableViews`. If a view is omitted by the backend, its tab is hidden.
3. **Dynamic Section Availability**: Within `model.detail`, sections (Summary, Campaigns, Products, Search terms, Targets & bids, Cross-sales) are rendered only when listed in `model.detail.availableSections`.
4. **Formatting**: Currency formatting utilizes `model.formatMoney` when provided, falling back gracefully to standard presentation formatters.
5. **No Mutation Actions in UI**: Campaign/bid adjustments, API fetching, credential management, and database queries are completely absent.

---

## 5. UI Boundaries & Limitations (Handoff to Codex)

1. **Integration into App Shell**:
   - `AdvertisingWorkspaceView` is ready to be mounted in `src/app/App.tsx` or routed via the navigation shell by Codex.
   - Props should be fed from Codex's state hooks / background engine.
2. **Catalog & Financial Product Linking**:
   - The UI wires `onOpenFinancialProduct(productId)` to button clicks on product rows and drawer headers. Codex should map this callback to existing financial product page navigation.
3. **Group Persistence**:
   - The UI modal fires `onSaveGroup(draft)` with `{ name, productIds }`. Codex will wire this to persistent storage / Dexie and re-feed updated `model.scopeChoices`.
4. **Android Native Support**:
   - The UI adheres to responsive mobile constraints (touch targets >= 44px, no hover dependency, zero horizontal overflow). Android integration, native bridge synchronization, and APK packaging are reserved for Codex.

---

**Status**: `READY_FOR_CODEX_INTEGRATION`
The presentation layer is complete, verified, and ready for integration by Codex.
