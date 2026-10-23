# Seller Analytics — Architecture

## Architectural Goal

Preserve the functional composition philosophy of the original AWK engine while implementing a browser-native React/TypeScript application.

High-level flow:

```text
Data Source
    ↓
Source Adapter
    ↓
Normalize
    ↓
Canonical Events
    ↓
Enrich
    ↓
Filter
    ↓
Aggregate
    ↓
Metric / Formula Engine
    ↓
Visualization / Dashboard / Insight / Forecast
```

## Layering

### 1. UI Layer

Responsibilities:

- render screens/components
- collect user intent
- build declarative specs
- show results

Must NOT:

- calculate profit
- classify marketplace transactions
- normalize source files
- contain SQL/business formulas

### 2. Application Layer

Responsibilities:

- orchestrate workflows
- connect UI specs to analytics engine
- manage datasets and saved views
- coordinate persistence and workers

### 3. Core Domain Layer

Pure TypeScript only.

Recommended modules:

```text
core/
  data/
  normalize/
  filter/
  enrich/
  aggregate/
  metrics/
  formula/
  insights/
  forecast/
  scenario/
  validation/
```

Rules:

- no React imports
- no ECharts imports
- no Dexie imports
- no DuckDB imports
- no DOM access
- no mutable global analytics state

### 4. Adapters

Marketplace or infrastructure-specific behavior lives here.

Examples:

```text
adapters/
  amazon/
  flipkart/
  meesho/
  generic-csv/
  duckdb/
  indexeddb/
  charts/
```

## Core Interfaces

### Data Source

```ts
interface DataSource {
  id: string
  name: string
  load(): Promise<RawDataset>
  refresh?(): Promise<RawDataset>
}
```

Potential implementations:

- CsvSource
- ExcelSource
- AmazonApiSource
- FlipkartApiSource
- GoogleSheetsSource

### Source Adapter

```ts
interface SourceAdapter {
  id: string
  detect(input: RawDataset): DetectionResult
  normalize(input: RawDataset, mapping?: MappingSpec): CanonicalDataset
}
```

### Analytics Engine

```ts
interface AnalyticsEngine {
  execute(dataset: DatasetRef, query: QuerySpec): Promise<ResultSet>
}
```

Implementations may include:

- JavaScriptAnalyticsEngine
- DuckDbAnalyticsEngine

The rest of the app should not care which implementation is used.

## Canonical Event Model

Prefer a long/event-based financial representation.

A source row may emit multiple canonical financial events.

Example:

```text
ORDER_ID | SKU | EVENT | AMOUNT | AMOUNT_TYPE
A001     | X1  | SALE  | 899    | PRODUCT_REVENUE
A001     | X1  | FEE   | -90    | COMMISSION
A001     | X1  | FEE   | -75    | SHIPPING
```

Why:

- new fee types do not require schema changes
- all financial components remain auditable
- generic aggregation becomes easier
- unknown financial events can still be preserved

## Query Specification

UI must produce structured query specs rather than code.

Example:

```json
{
  "filters": [
    {"field":"STATE","op":"eq","value":"GUJARAT"},
    {"field":"RETURN_RATE","op":"gt","value":20}
  ],
  "groupBy": ["SKU"],
  "metrics": ["GROSS_SALES","NET_PROFIT"],
  "sort": [{"field":"NET_PROFIT","direction":"desc"}],
  "limit": 10
}
```

## Filter Model

Generic operators should include:

- eq
- neq
- contains
- notContains
- startsWith
- endsWith
- gt
- gte
- lt
- lte
- between
- in
- notIn
- isEmpty
- isNotEmpty
- dateBefore
- dateAfter
- dateBetween

Support nested AND/OR groups.

## Metric Model

Metrics are specifications.

Example aggregate metric:

```json
{
  "id":"gross_sales",
  "type":"aggregate",
  "aggregation":"sum",
  "field":"AMOUNT",
  "filters":[{"field":"AMOUNT_TYPE","op":"eq","value":"PRODUCT_REVENUE"}]
}
```

Example formula metric:

```json
{
  "id":"profit_margin",
  "type":"formula",
  "format":"percent",
  "expression": {
    "op":"divide",
    "left":{"metric":"net_profit"},
    "right":{"metric":"gross_sales"}
  }
}
```

Never use eval().

## Metric Dependency Graph

Metric references create a directed graph.

Requirements:

- topological evaluation order
- circular dependency detection
- prevent deleting a metric that is referenced by others without confirmation/repair

## Cost Master Architecture

Represent cost master independently of source data.

Persisted model:

```ts
interface ProductCost {
  sku: string
  unitCost: number
  effectiveFrom?: string | null
  updatedAt: string
}
```

Multiple records may exist for a SKU. The newest `effectiveFrom` on or before the transaction date applies. An undated record is the fallback for dates not covered by a dated record. Refund COGS reversal uses the related original sale date when that sale is available.

Missing cost policy should be configurable:

- block final profit calculation
- warn but calculate partial profit
- explicitly assume zero (never default silently)

## Worker Architecture

Heavy work should run outside React main thread.

```text
React Main Thread
      ↓ messages
Analytics Web Worker
      ↓
Parser / Normalize / DuckDB / Metrics / Forecast
```

## Storage Architecture

Initial local-first design:

- IndexedDB for application config, mappings, cost master, saved metrics, dashboards, saved views
- analytical dataset in browser memory / DuckDB-Wasm as appropriate

Future cloud sync should be an adapter, not a rewrite.

## Visualization Architecture

Chart components consume declarative specs.

Example:

```json
{
  "type":"bar",
  "dimension":"SKU",
  "metric":"NET_PROFIT",
  "sort":"desc",
  "limit":10
}
```

Charts do not calculate business metrics.

## Dashboard Architecture

A dashboard is a saved specification:

```ts
interface DashboardSpec {
  id: string
  title: string
  globalFilters: FilterGroup
  widgets: WidgetSpec[]
}
```

Widgets may include:

- KPI
- Chart
- Table
- Text/Insight
- Data quality

## Insight Architecture

Rules are independent pure functions:

```ts
type InsightRule = (context: AnalysisContext) => Insight[]
```

Examples:

- detectHighReturnRate
- detectNegativeProfitSku
- detectHighTacos
- detectCostCoverageRisk
- detectConcentrationRisk

## Forecast Architecture

```ts
interface ForecastModel {
  id: string
  forecast(series: TimeSeries, options: ForecastOptions): ForecastResult
}
```

## Plugin Direction

Long-term plugin interfaces may exist for:

- source adapters
- transforms
- metrics
- chart renderers
- insight rules
- forecast models
- data sources

But do not over-engineer plugin loading in the MVP. Start with strong internal interfaces first.

## Recommended Folder Structure

```text
src/
  app/
  core/
    data/
    normalize/
    filter/
    enrich/
    aggregate/
    metrics/
    formula/
    insights/
    forecast/
    scenario/
  adapters/
    amazon/
    generic-csv/
    duckdb/
    indexeddb/
  engine/
    interface.ts
    javascript/
    duckdb/
  features/
    upload/
    mapping/
    filters/
    costs/
    metric-builder/
    explore/
    dashboards/
    scenarios/
  visualizations/
  components/
  persistence/
  workers/
```

## Joined product advertising

`core/advertising/sponsoredProducts.ts` aggregates reported advertising performance and builds joined product economics from `SkuProfitSummary`. It does not normalize marketplace identities internally: application orchestration supplies the source adapter's SKU normalizer. Aggregation preserves all spend and separates unmatched evidence. Financial normalization and business dashboard totals are unchanged.

Advertising uses posting dates and ad report dates; the older completed-order dashboard basis does not gate advertising sales. `SkuAdvertisingPanel` renders the same pure results inside both metric/SKU and advertising drilldowns. There is no GST evidence entry or allocation. The core returns product contribution after reported ads, restoring booked SKU advertising before deducting reported spend once. Overall business profit remains on Unified booked expense. See ADR-049, which supersedes ADR-046 tax allocation.

Seller presentation selectors (`core/advertising/sellerOverview.ts`) compose existing financial and advertising results without changing canonical evidence or financial profit. React renders overall results and continuous product profiles; advanced source detail uses disclosures rather than report navigation.

Presentation context (ADR-052): seller product selectors receive separate financial/cohort and posting-period results. With available advertising evidence, the product list displays the posting-period result and direct product entry preserves it. Metric entry retains its financial selection. Advertising presentation never substitutes financial-cohort amounts for missing posting-period activity. Selection state and reset/Undo belong in application orchestration; React renders explicit context and the selectors' availability results.

`core/search/reportSearch.ts` builds deterministic search documents and bounded query results from canonical events plus optional configured product aliases. React renders those results and source evidence. `core/costs/setProductCost.ts` validates and immutably replaces one SKU/effective-period record. Application orchestration holds an ephemeral cost draft and supplies the same preview cost collection to dependent selectors; the existing browser cost adapter persists only explicit saves. Product workspaces and search-order evidence share the inline cost editor through an application-provided context.

## Workspace responsiveness (ADR-054)

- Product analysis groups canonical events once and shares an invocation-local `ProductCostResolver` instead of scanning the full cost master for every inventory event.
- `productCostPreview.ts` updates only summaries whose normalized SKU is affected by the draft, preserving unaffected result references. React defers preview work and displays pending state, but never calculates financial formulas.
- `businessOverview.ts` composes existing dashboard/cost/unit-economics selectors into a single financial result for KPI and breakdown presentation.
- Direct product opening uses `ProductDetailDialog`; it does not invoke the metric comparison/ranking builder. Source search detail calculates only relevant linked orders. Report comparison, fee audit and full quality diagnostics run in their relevant workflows.
- Heavy commercial/geography/time/portfolio disclosures mount on demand. Product tables, order lists, cost history and bulk SKU pickers render bounded subsets with explicit navigation/counts; no canonical evidence is discarded.
- `activeReportStore.ts` persists active-report/view identifiers and preferences separately from normalized datasets. Restoring that optional view does not alter source evidence or backup schema.
- `workspace.css` defines the current application shell, compact financial layout and responsive destinations; earlier theme layers remain compatible with evidence/detail components.

No analytics worker or new dependency is introduced by this optimization. Current measurements exercise synchronous pure selectors and browser interactions; they do not establish performance guarantees for arbitrary dataset sizes.

Product navigation (ADR-055): `useProductPage` owns static-host-compatible hash history, product scope, return destination, scroll and focus. The originating workspace remains mounted but hidden while `ProductPage` renders. `ProductCostEditor` submits fallback cost records through the existing pure cost operation and shared draft context; dated history remains in CostMaster. ProductPage displays selector results without introducing financial formulas.

Brand assets live in `public/brand/` and are referenced through Vite BASE_URL; original artwork stays in `logo/`. Workspace tokens own the warm/gold palette and chart sales/profit colors. Advertising recovery updates global dates plus the selected product scope together; product search discovery remains report-wide but navigation follows the explicit date selection (ADR-056).

`ChoiceGroup` is a presentation-only native radio group for small fixed option sets, with a unique React-generated group name. Consumers continue to submit existing filter specifications. Theme tokens govern Returns cards and source-order interaction states, preventing legacy dark component backgrounds from leaking into light mode (ADR-057).

ReportSearchField controls field-specific matching in the pure search selector. Search documents separate SKU aliases, configured identity aliases, titles and city text; core uses generic identity naming while the UI labels advertising identities as ASIN. Mode selection remains presentation state (ADR-058).

ContentSection uses IntersectionObserver to mount visible product sections near the viewport without disclosure controls. BrandEntrance is presentation-only: Web Animations API measures the responsive logo destination, reveals the workspace and records a per-tab session flag; reduced-motion and failure paths skip safely. Financial selectors and internal contribution identifiers remain unchanged by the Profit after ads display label (ADR-059).

`core/insights/focusAnalysis.ts` accepts generic product/return/ad/campaign evidence and produces deterministic ranked shares, cumulative totals and concentration groups. App maps existing financial/advertising selector outputs into that input. `FocusPriorities` displays results, manages visible analysis selection and opens source product/campaign evidence; React does not calculate financial values/shares. Work is limited to the active Dashboard.

`rankAdvertisingEfficiency` filters review candidates using generic spend/sales evidence and optional known product profit, then feeds flagged spend into the existing concentration selector. Full-group spend/sales percentages, ROAS and review reason are calculated in core. Unmatched source sales remain distinct from unavailable sales. UI displays the two denominators explicitly (ADR-061).


## Sale-period analysis and release status

`buildOrderCohort` in `core/analytics/orderLifecycle.ts` selects orders by original positive sale date and gathers their complete linked history from the active report. It returns available, pending, unmatched, and superseded evidence streams without modifying canonical events. No maturity deadline gates inclusion. Account-level activity uses the selected posting period.

`buildCohortFinancials` produces available totals, pending components, an estimate including pending activity, and order-level evidence using the shared dashboard and historical-cost engines. React only renders these results. An entire identical Deferred source row may be superseded by one Released counterpart; raw references and multiplicity must be preserved. Posted activity remains the source reconciliation view. See ADR-045.

PWA delivery (ADR-062): scripts/viteOffline.ts is a local build-only plugin that hashes finished assets and generates scoped sw.js. public/manifest.webmanifest and platform brand icons are relative-path safe for static subdirectory hosting. adapters/browser/pwa.tsx owns install/update/offline presentation and production-only worker registration. A local-only built-server fixture and separate Playwright config exercise nested hosting, cache persistence and update activation; test artifacts are isolated. @types/node is a development-only requirement for the Node build adapter.

Performance/reliability audit: indexed advertising grouping and product joins replace repeated full scans; core cohort financial summaries share indexed cost lookup and only include per-order details when requested. React.lazy splits large workspace screens. Main's sale-period order/pending semantics are integrated; OrderActivityContext carries optional source activity into inline audits without duplicating metric calculations.
