# Seller Analytics — Architecture

## Shared connected delivery (ADR-075)

`server/shared/` owns authenticated access to durable Netlify Postgres source tables,
encrypted credentials, atomic source-page/checkpoint transactions and cached
normalization/dashboard results. Owner login is configured with a server-side
email and scrypt password hash, with opaque sessions hashed in Postgres. Every
data request verifies the session and configured owner; request bodies cannot
select an owner. Expiring sessions, password-version invalidation, sign-out and
persisted login throttling live behind `OwnerAuthRepository`.

`server/shared/database.ts` isolates the official `@netlify/database` connector.
All queries use fixed SQL with bound parameters; no application ORM or duplicate
Postgres client was added. Netlify chooses the current production/preview branch.
Native SQL migrations in `netlify/database/migrations/` create tables/functions
at deployment; application startup does not run arbitrary DDL. PUBLIC database
privileges are revoked and RLS is enabled. The server's database-owner connection
can bypass RLS, so owner predicates/authentication remain mandatory. A permanent
authorization binding prevents reconnect/disconnect from mixing seller data.

`src/adapters/amazon-shared/` provides authenticated transport and shared source
storage behind the existing hosted coordinator. One renewable database lease
coordinates open devices; source pages are fetched and committed server-side.
Stopped/closed browser sessions leave durable continuation tokens for another
device. No closed-browser scheduled worker is introduced. Metadata compare and
swap separates checkpoint versions from actual-content source revisions.

The server invokes the existing pure adapter/core engines, caches normalized
readings by source revision/engine, and dashboard results by revision, settings,
filters and marketplace day. The browser retains a previous reading while
revalidating; secondary drilldowns use the same normalized dataset and shared
settings. Temporary user cost previews intentionally remain local. Generic core
does not import database, marketplace adapter, browser or React modules.

Orders-based card values have an explicit `ORDERED` policy: recorded order totals
only, with unavailable totals exposed. Ledger/profit recognition remains
all-recorded activity in the verified original purchase period. No historical
SKU guesses or source switching are used by that policy. Shared costs default
to `BLOCK`. Legacy modes retain their existing recognition settings.

ADR-075 replaces the unactivated Supabase REST/Auth implementation from ADR-074.
This supersedes ADR-073's browser-owned source model only for
`VITE_AZULIA_DELIVERY=shared`. See `docs/shared-seller-setup.md` for migration,
the current bounded snapshot size and the deferred scale-out work. The official
database connector is the sole new application dependency. No runtime
verification was performed at the owner's request.

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

## Browser PDF tools (ADR-064)

Tools is a report-independent workspace destination. `features/tools/ToolsPage` collects an ordered PDF batch, starts/cancels a job and displays downloadable results. `adapters/browser/labelCutter` loads self-hosted DejaVu fonts and starts a dedicated module worker, transferring input buffers rather than uploading them. Cancellation/navigation terminates the worker and releases its WASM memory. Download object URLs are revoked when replaced or unmounted.

`adapters/amazon-labels/` owns the source-specific invoice geometry, merged product/quantity matching, duplicate detection, label layout and packing list. It wraps the official typed `mupdf` WASM dependency (pinned 1.28.1); no PDF APIs or Amazon layout rules enter generic core analytics. The worker configures the bundled WASM URL before importing MuPDF. Vite targets ES2022 for top-level await and uses ES module workers. MuPDF is explicitly included in development dependency prebundling, preventing a first-use optimizer reload from clearing open pages on fresh checkouts/CI. PDF execution loads only when processing. The production shell precaches the small UI/worker chunks; the approximately 11.9 MB of WASM/font assets load and cache on first use, avoiding that download for analytics-only users. Once a successful run has loaded those assets, later jobs work offline. Download links share one URL-lifecycle hook; previews open in a browser tab without starting an embedded PDF viewer.

Rendering uses the original embedded images, clipped above/below the verified blank product gap, with no page screenshots, OCR, pixel resampling or JPEG recompression. Indexed color labels expand losslessly to 8-bit sRGB as in the Python extractor; monochrome labels retain their channels. Five-decimal placement scale rounding, A4 dimensions, DejaVu fonts, wrapping limits and packing-list measurements match the source tool. The browser PDF need not be byte-identical (compression, object IDs and metadata may differ). Private parity validation checks text, image digests and full-page rendered pixels at 72/203/300 DPI against the original Python implementation. All tracked fixtures are generated fictional PDFs.

MuPDF is AGPL-3.0-or-later with alternative commercial licensing from Artifex; its distribution/source obligations apply to releases using this dependency. DejaVu font notices ship in `public/fonts/LICENSE.txt`. No backend, external CDN or analytics accounting change is introduced.

## Retained local connection after rollback (2026-11-07)

The report-based frontend is restored from `34f5eac`. `server/local` serves the build over loopback with exact Host/Origin checks; `server/amazon/pilot.ts` and `permissions.ts` support existing credential acceptance and optional permission checks. Credential files stay private. Automatic API download endpoints and connected analytics modules have been removed. The local server does not feed business data into the restored frontend. Future backend/data architecture is undecided; no validation was executed during rollback.

## ADR 066 — Automatic record delivery into the unchanged report application (2026-11-07)

The owner explicitly authorizes automated initial history retrieval, incremental/new or changed records, older-date backfill, deterministic sorting, syncing with the browser closed and live updates without a page reload. Manual upload remains fallback and all existing business calculations/screens stay intact. This supersedes ADR-065's no-automatic-fetch boundary only; it does not reauthorize the removed connected dashboard/lifecycle architecture.

The existing input is Amazon Unified Transaction CSV. Amazon's Finances 2024-06-19 listTransactions provides programmatic financial activity, not an exact Unified CSV export nor a universal updated-since feed. The local source driver therefore fetches bounded posted-date windows and explicit order-reference history, preserves raw records and translates supported money into the existing Unified columns. Every accepted source amount must reconcile through the original normalizer; item and aggregate transaction trees are overlapping and never both added. Unknown labels/differences remain unclassified, with account-level residuals unallocated. Source identity/time breaks sorting ties; normalized event identities survive older backfill. Item quantity is emitted once per product item. Explicit complete deferred-release references supersede originals; ambiguous release activity stays reviewable. Unsupported currency/precision keeps the previous reading rather than fabricating values. Source location and actual shipping-method gaps are not guessed.

Built-in node:sqlite (no new package) is hidden behind server/local/sync/store.ts. It holds per-credential-fingerprint source records, changed old versions, rejected-source audit text, coverage, durable next tokens and requested ranges under private .local/activity-cache/. SQLite transactions commit records and pagination atomically; only terminal source pages mark complete coverage. Stale tokens/checkpoints restart safely using source IDs. Direct cached history is never repeatedly bootstrap-downloaded. A short recent overlap catches delayed/new events; idle older unresolved order references are checked every six hours. Arbitrary historical changes outside these revisits are not guaranteed by the API; financial activity may lag 48 hours.

The backend starts its coordinator with the existing local launcher, independently of browser tabs. It requires the computer and process running; no OS service or cloud storage is installed. Fixed India EU endpoints, loopback Host/Origin guards and explicit POST intent remain mandatory. The browser receives source data, never secrets/tokens. A different configured identity uses a separate cache and reading. History requests persist so they complete with the browser closed.

The browser restores the last automatic normalized import, polls source revision, normalizes changed readings in a worker, persists one logical reading per account, and replaces React dataset state without resetting dates/costs or reloading the document. Manual imports do not blindly merge with ID-bearing API data; they remain a separate selected fallback. Older custom dates queue uncovered intervals. Progress, source errors, history coverage and delivery limitations appear in a small status strip; existing analytics pages and formula engines remain unchanged. Advertising workbooks retain their existing upload flow because SP-API credentials do not establish Ads reporting access.

Regressions are authored for coverage gaps, partial pagination, durable restart, exact money, hierarchy conservation, source upserts/sorting, stable event IDs, release links, unknown values and fallback boundaries. Tests/builds/browser/mobile/live calls remain deferred by owner instruction. No live result parity or timing claim is made. Official source contract: https://developer-docs.amazon/sp-api/docs/finances-api-v2024-06-19-reference and https://github.com/amzn/selling-partner-api-models/blob/main/models/finances-api-model/finances_2024-06-19.json .

ADR-066 delivery refinement: the local cache maintains a source revision index. After the initial reading, the browser receives only changed records and merges them by transaction ID before normalizing the complete local view. A cache without a compatible source baseline receives one full local baseline; unchanged overlap reads do not publish a new data revision. No whole-history Amazon download or browser transfer occurs on every poll.

### ADR-066 correction — neutral zero item currencies (2026-11-07)

Owner reported automatic delivery stuck, then provided the money-currency conversion error. Read-only inspection of cached source shapes found empty item placeholders with currencyAmount zero and currencyCode null beneath valid INR zero-value transactions. No credential contents or transaction amounts were printed. The adapter had treated that neutral child exactly like unsupported nonzero money and rejected the entire reading. Permit currencyless zero only at child boundaries under an already validated INR transaction. Nonzero missing-currency values, unsupported numeric formats, explicit foreign currencies and currencyless root totals remain errors. Keep all raw cached records; no history re-download or analytics formula change is needed. Delivery errors now take priority in the status heading rather than leaving Connecting visible, and fetched empty ranges have their own status. Authored regressions cover neutral zero, nonzero missing currency and explicit foreign zeros; no tests/builds/live Amazon calls were run.

### Purchase-date order attribution (ADR-067)

The automatic delivery driver now joins cached Finance records to verified Orders purchase timestamps. `server/local/sync/orders.ts` discovers purchase windows and resolves missing dates; the existing SQLite store persists minimal order metadata and independent pagination/coverage. Metadata changes publish revisions for affected source IDs, so the existing browser worker updates saved results live. Known order histories are revisited after initial discovery even when earlier money is fully released, allowing later refunds/releases to update the original purchase period.

Canonical `orderPurchaseDate` is optional: absent preserves CSV first-sale inference, explicit null prevents an API posting-date fallback. `releaseState` makes API realized/pending boundaries explicit; `orderOriginRequired` prevents unidentified order rows becoming account-period sales. The generic cohort selects purchase dates and follows all linked cached dates; unrelated periods are excluded. Account expenses use posting dates. Source timestamps and money remain unchanged. Product-cost dating and cohort sales trends honor verified origin dates. API dashboard basis is fixed to purchase periods; manual CSV basis choices remain. See ADR-067 for pending, discovery, scope and validation limitations.

### Reference-file reconciliation (ADR-068)

Optional `scripts/compare-csv-api.mjs` runs the production CSV adapter, API adapter and cohort engine against a consistent read-only cache snapshot. It separates current verified-date totals, diagnostic CSV-origin totals, same-cutoff released comparisons and newer full-cycle/pending activity. It writes private evidence only under ignored `.local/reconciliation/`. `scripts/reconcile-local-history.mjs` requests/monitors only missing reference history through the guarded local backend; `scripts/repair-order-dates.ts` resumes a checkpoint and recovers supported saved date evidence without exposing credentials.

The date reader accepts actual S-prefixed order IDs and quarantines unsupported rows individually. Pagination continues for valid metadata; minimal source evidence is retained, failures are counted visibly and revalidated after parser updates. Order dates remain separate from financial raw source. Verified India fee-column options correct closing fees, FBA shipping chargeback, Easy Ship postage/delivery components and explicit postage reversals without changing core formulas. Automatic reading version 4 invalidates older financial categorizations.

### Fast local queries and calculation state (ADR-069)

`normalizeDataset` builds a first-header-wins row lookup and a per-call label cache. `indexOrderHistory` owns date-independent grouping/replacement resolution; `selectOrderCohort` applies the requested range without rebuilding history. App memoization reuses one index across current/previous ranges. Generic sourceIdentityResolved marks adapter-resolved identities; legacy CSV matching remains unchanged.

Automatic delivery batches revision application about every 15 seconds while polling status every three seconds. Fetch/worker/save phases retain the last saved reading, then replace it atomically. Network and worker deadlines prevent indefinite fetching/calculating states. Results ready and Background sync are separate UI states, with source gaps and newer queued revisions disclosed independently. The normalized reading remains the persisted cache; no redundant metric database is added.

### Seller-facing scope and product metadata (ADR-070)

Both calculation bases are declarative UI options for automatic and manual data. Core cohortExcludedRecords groups excluded transactions and assigns reasons; countFinancialRecords distinguishes records from normalized monetary components. Generic optional sourceTransactionId/descriptionIsProductTitle describe identity and display intent without marketplace assumptions. Compact controls and a native paginated dialog replace verbose scope panels; calculations stay outside React.

The optional Catalog reader enriches actual item titles with cached ASIN-specific summaries/images. catalog_items and indexed record_asins live in the existing private SQLite cache; image/title changes publish only affected source IDs. No source money is rewritten. Per-endpoint authorization/service errors are sanitized and Catalog denial does not stop Finance/Orders. Continuous fresh cached financial coverage acknowledges redundant initial history checks; incomplete or stale/gapped coverage still requires retrieval. See ADR-070 for live access limitations and owner-restored view policy.

### Purchase-period live recognition (ADR-071)

`CanonicalDataset.orders` carries minimal order metadata independently of canonical financial events. The local Orders reader/store publishes identity/status changes even before Finance supplies a transaction; the delivery adapter translates purchase timestamps to marketplace dates without synthesizing money. Cohort indexing unions known order identities with recorded financial histories. The app uses `ALL_RECORDED` recognition; deferred/released states are audit metadata, and all linked updates stay in the verified purchase period. Generic core aggregation remains independent of React and marketplace adapters. Order totals are displayed separately from financial product sales; unknown dates remain excluded for review, and settlement transfers remain outside operating profit.

### Quiet delivery updates (ADR-072)

`core/sync/sameContent.ts` provides deterministic JSON-content equality without marketplace dependencies. The local source store publishes revisions only for meaningful content differences, not JSON key ordering. The browser delivery adapter merges snapshots by source identity, compares order metadata separately and distinguishes changed content from a newer checkpoint. Unchanged checkpoints persist their revision without worker normalization, profile regeneration or React dataset replacement. Actual data changes and mapping migrations retain the existing complete calculation path. Dashboard skeleton state is separate from delivery phases: background processing keeps the completed view mounted; initial preparation and user filter transitions may show skeletons.

### Optional stateless hosted delivery (ADR-073)

Netlify's `amazon` function delegates to `server/relay/handler.ts`. It validates request origin/method/intent, credential/token lengths, fixed allowed operations, identifiers, dates and payload limits. Existing source readers accept an optional request-scoped access token; their default local behavior remains unchanged. The relay does not import a runtime database, create timers, write source records, or use a shared token cache. Tokens returned by the exchange belong to the caller's temporary browser session.

`src/adapters/amazon-hosted/` owns the session, browser IndexedDB transactions and explicit sync coordinator. Source pages and next tokens commit atomically; only terminal reads mark complete history. Source equality suppresses unchanged revisions, leases protect account-specific writers, and persisted operation cooldowns prevent Stop/Resume from resetting rate allowances. Known purchase dates and real Catalog metadata are joined to cached raw Finance records when assembling a snapshot. `useAutomaticReport` consumes the same delivery contract through a browser-local transport in hosted builds; its polling never makes Amazon/Netlify requests. Only the explicit connection/sync controls use the relay. Existing deterministic core analytics and the worker remain independent of this hosting choice.
