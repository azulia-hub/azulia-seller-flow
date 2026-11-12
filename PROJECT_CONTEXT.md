# Seller Analytics — Project Context

## Product Vision

Build a polished, mobile-friendly, local-first analytics web application for marketplace sellers. The app should let non-technical users upload reports, normalize data from different marketplaces, explore and manipulate data, create custom metrics without code, build dashboards, compare periods, forecast trends, inspect returns/ads/profitability, and receive deterministic insights and suggestions.

The product should feel like a simplified seller-focused BI platform rather than an Amazon-only report viewer.

## Core Philosophy

The original AWK engine was designed around four small composable stages:

1. normalize
2. filter / enrich
3. aggregate
4. render

The web application must preserve the same philosophy:

> Small independent transformations + composition = complex analytics.

Non-negotiable rules:

1. Core analytics must be marketplace-agnostic.
2. Marketplace-specific knowledge belongs only in adapters/configuration.
3. Core functions should be pure, independently testable, and replaceable.
4. React/UI components must not contain business calculation logic.
5. Metrics must be declarative specifications, not hard-coded components.
6. Unknown/new fields and financial events must be preserved rather than silently discarded.
7. Normalization must not create or destroy money. Financial totals must reconcile.
8. Data + specification = result.
9. External dependencies should be minimal, actively maintained, and hidden behind adapters/interfaces.
10. End users should not need to write code.
11. Missing cost data must never silently default to zero without a visible warning.
12. The application should be responsive and usable on desktop and mobile.
13. Local-first privacy is a first-class feature: core analytics should work without uploading business data to a server.

## Canonical Data Principle

Every source (Amazon, Flipkart, Meesho, generic CSV/Excel, future APIs) may have different column names and transaction terminology.

After normalization, all sources must speak one canonical language.

Example canonical event fields:

- DATE
- SOURCE
- ORDER_ID
- SKU
- EVENT
- QTY
- AMOUNT
- AMOUNT_CLASS
- AMOUNT_TYPE
- STATE
- CITY
- STATUS
- RAW_TYPE
- RAW_DESC
- CLASSIFIED
- plus any preserved extra fields

The canonical model should be extensible. New source fields must not require core engine rewrites.

## Financial Sign Convention

Use a consistent signed money convention:

- Money coming to seller: positive
- Money leaving seller: negative

Examples:

- Product sale: positive
- Refund: negative
- Commission: negative
- Shipping fee: negative
- Return shipping fee: negative
- Advertising: negative
- Reimbursement: positive
- Settlement/bank transfer: tracked separately from operating profit

This allows generic marketplace net calculations using SUM(AMOUNT) over operating events.

## Profit Rule

Current business assumption:

- Returned item is assumed to be in good condition and resellable unless return condition data says otherwise.
- Therefore returned quantity reverses COGS.
- Only inventory permanently consumed should contribute to COGS.

Conceptually:

Net Profit = Marketplace Operating Net - Net COGS

Profit Before Ads = Profit After Ads + Ads Spend

TACOS = Ads Spend / Gross Sales × 100

ROI = Profit After Ads / Net COGS × 100

## Cost Master

The web app must provide a Product Cost Master.

Users should be able to enter costs through:

- Manual entry
- CSV/Excel import
- Paste from spreadsheet
- Bulk apply to selected SKUs
- Future: cost components / landed cost

After report import, app should detect missing SKU costs and show a clear assistant:

- number of SKUs missing cost
- sales represented by missing-cost SKUs
- editable cost fields
- ability to save for future reports

Costs should be persisted locally and reused next month.

Cost history supports optional effective dates. An undated cost is a fallback; dated records apply from their effective date, and missing historical periods remain visible rather than being treated as zero.

## Metric Builder

Users must create metrics without writing code.

Supported conceptual metric types:

1. Aggregate metric
   - SUM
   - COUNT
   - COUNT DISTINCT
   - AVG
   - MIN
   - MAX
   - MEDIAN / percentile later

2. Formula metric
   - Add/Subtract/Multiply/Divide existing metrics

3. Ratio / Percentage metric

4. Conditional metric (future)

Metric definitions should be stored as structured JSON / expression trees, never eval() strings.

Metric dependencies must form a DAG. Circular dependencies must be rejected.

## UI Vision

The app should be polished, professional, simple, and interactive.

Primary screens:

- Overview
- Data
- Explore
- Products
- Orders
- Returns
- Advertising
- Profitability
- Forecast
- Scenarios
- Dashboards
- Metric Builder
- Settings

Complexity modes:

- Basic: simple seller dashboard
- Explore: filters, groups, charts, pivot-like analysis
- Builder: custom metrics, mappings, dashboards, pipelines

## Dashboard Metrics

Default seller overview should include at minimum:

- Gross Sales
- Net Product Revenue
- Sold Qty
- Return Qty
- Net Delivered Qty
- Return %
- Easy Ship / shipping net of reversals
- Total marketplace charges
- Reimbursements
- Net COGS
- Profit Before Ads
- Profit Before Ads %
- Ads Spend
- Profit After Ads
- Profit After Ads %
- TACOS
- ROAS
- ROI
- Average Selling Price
- Profit per delivered unit
- Break-even TACOS
- RTO returns / customer returns when source data supports classification
- Top performing SKU
- Lowest performing SKU
- Unknown/unclassified financial events
- Missing cost coverage
- Unassigned charges

Amazon Unified Transaction return rule: a refund whose order has a positive Easy Ship handling-fee reversal is an RTO; a refund with an order ID and no reversal is a customer return. Refunds without an order ID remain unknown and visible.

Unit-economics formulas:

- Profit per delivered unit = profit after ads / net delivered quantity. It is unavailable for incomplete cost coverage or a non-positive delivered quantity.
- Break-even TACOS = max(0, profit before ads / gross sales) x 100. It is unavailable for incomplete cost coverage or non-positive gross sales.
- SKU-level advertising remains unassigned unless the source provides a defensible SKU attribution; break-even TACOS does not invent that allocation.

## Data Quality Rules

Every import should produce a data quality/reconciliation summary:

- detected source
- row count
- normalized event count
- source financial total
- normalized financial total
- reconciliation difference
- unknown transaction types
- unclassified amounts
- missing keys
- missing SKU costs
- unassigned marketplace charges

Unknown data should remain visible and auditable.

## Visualization Principles

Charts are presentation only. They must not contain business logic.

Use declarative chart specs, e.g.:

- chart type
- dimension
- metric
- sort
- limit
- optional breakdown

The visualization layer should consume already-calculated data.

## Insights

Insights should initially be deterministic rule-based functions, not AI guesses.

Examples:

- return rate increased materially
- SKU has high sales but negative profit
- ads grew faster than revenue
- shipping cost % is unusually high
- two states drive most returns
- margin declining across periods
- cost coverage incomplete

Future AI should translate natural language into query/metric specs and explain verified engine output, not calculate numbers independently.

## Forecasting

Start simple and modular:

- Moving average
- Weighted moving average
- Linear trend
- Exponential smoothing

Later:

- Seasonality
- Holt-Winters
- Confidence bands
- anomaly detection

Forecast API should remain generic and replaceable.

## Scenario / What-if

Future scenario engine should allow users to change inputs such as:

- selling price
- ad spend
- cost price
- return rate
- shipping cost

and instantly see projected profit impact.

## Privacy

Initial product should be local-first and deployable to GitHub Pages.

Business data should remain in the browser for core analytics.

Future connected/live mode may require a backend for authenticated APIs, secrets, scheduled ingestion, and cloud sync, but core analytics must remain independent of backend infrastructure.

## Product advertising enrichment

Uploading Sponsored Products data enriches the existing SKU view with actual reported spend, ACOS, attributed ROAS, TACOS, click/conversion metrics, per-unit ad costs, campaign/day evidence and profit after product ads. Reported spend is never scaled to booked advertising expense. Advertising GST is not allocated or entered. Product contribution after reported ads excludes advertising GST and unassigned account expenses, while retaining existing source taxes, charges and entered product-cost treatment. It uses posting dates and is not final net profit or fully GST-exclusive. See ADR-049. Existing Unified business metrics remain unchanged. See ADR-046.

Current navigation follows ADR-051: Dashboard → product → order. Advertising metrics appear directly at their overall/product scope. Report-specific tabs and product advertising entry buttons are superseded. Reports remains the upload and data-quality destination.

Seller-facing labels and context follow ADR-052: Business profit uses booked expense; Product contribution uses reported spend. Product comparisons with advertising and direct product profiles use posting-period financial results; metric investigations preserve their selected financial basis. These views disclose their basis and do not alter canonical financial formulas.

Report search and direct cost entry follow ADR-053. Search covers the active report's products, SKUs, supplied product identities, orders, locations and account source labels across all dates. Product cost can be entered inside the product profile, with live preview and explicit Save/Cancel. Historical cost and missing-data policies remain intact; only cost-dependent values become available when adequate cost coverage is supplied.

Current seller workspace (ADR-054) supersedes the earlier three-destination navigation: Dashboard, Products, Advertising, Returns, Product costs, Reports and Settings have clear destinations. Header search and direct product profiles retain the existing financial evidence hierarchy. Search profiles can cover all active-report dates without changing the dashboard selection. Active report/date/basis preferences restore after refresh. Explicit follow-up coverage recovery prevents exclusions from looking like lost data. Core calculations remain generic and local-first.

Current product interaction (ADR-055): products open in a dedicated workspace page. Back restores the originating list context. Unit cost uses a compact, initially closed Add/Edit control; it previews and saves the default fallback only. Dated cost maintenance remains in Product costs.

Azulia identity (ADR-056): the supplied gold/charcoal logo appears on warm ivory or charcoal surfaces with gold accents. Product advertising shared-date recovery stays on the selected product. Product search opens within explicitly selected dates, using all report dates only when All dates is selected; source evidence search remains report-wide.

Presentation refinement (ADR-057): Returns snapshots and order hover/selection use active theme surfaces. Small fixed filter/search choices remain visible as radio groups; dropdowns are retained for longer or dynamic lists, with disclosures for advanced/heavy investigations.

Report search now offers visible All / SKU / ASIN / Title / City / Order / Location modes. City searches cities only; Location searches cities and states; Order searches order identifiers. ASIN uses conservatively matched advertising identities.

ADR-059: Product contribution is presented as Profit after ads, with unchanged calculations and explicit advertising GST/shared-expense exclusions. Product pages show continuous titled sections instead of accordions. A brief once-per-tab logo entrance respects reduced motion and does not block analytics loading.

Where to focus (ADR-060) prioritizes the actual products/campaigns behind most selected-period sales, product losses, return losses and reported ad spend. It measures concentration rather than promising 80% growth. Losses are separate from profits, missing evidence remains explicit, and campaign spend/sales do not imply verified campaign profitability.

ADR-061: Ads/Campaigns focus now selects weaker sales output relative to spend, zero-sale spend, spend exceeding attributed sales and supported product losses after ads. Large budgets with proportionate sales are not automatically flagged. The 80% analysis covers only flagged spend; full-group spend/sales shares are labelled separately.


## Sales-period performance (current policy)

Select orders by original sale date and include all linked activity available in the active uploaded report, even when posted later. Main totals exclude explicit deferred transactions; pending sales, refunds, fees, reimbursements, and an estimate including pending activity are shown separately. Never exclude an entire order because it has pending activity or insufficient follow-up days. Unknown release statuses remain visible and included with disclosure.

Label this view “Orders sold in selected period” with an observation-through date; do not claim an order is finally completed after an arbitrary waiting period. Keep Posted activity for reconciliation, missing-origin activity separate, and unassigned account expenses on their selected posting dates. See ADR-045.

Current release (ADR-062): default theme is System; explicit choices persist. Azulia is installable from its deployed HTTPS site, uses the provided logo in platform icons and supports offline reopening of already saved reports after the production shell is cached. Updates require explicit reload and do not silently interrupt drafts. Installation does not sync devices. Sale-period reporting includes recent orders without a maturity gate; pending activity is separate.

ADR-063: Where to focus ranks actual monetary leaks after supported SKU advertising. Ads requires TACOS above 20% and a known loss. Separate profit, marketplace, shipping and fulfillment fee tabs retain the compact layout; fee tabs focus on products losing money after ads. The rejected product What if simulator is removed.

ADR-064 adds Tools → Amazon PDF Cutter without requiring an analytics report. The existing Python label preparation tool is rewritten in a local browser worker, preserving four-up A4 output, original label pixels, full product names, ordered quantities and optional packing lists. Source-specific PDF behavior stays outside the financial core; files never upload to a server.

## Current rollback checkpoint (2026-11-07)

Owner restores the pre-API report/PDF app (`34f5eac`) and retains only the local backend connection. Later connected business logic and dashboards are removed. Local hosting, credential setup/check and optional permission probe remain; secrets and original reports are preserved. Future API architecture is undecided. See ADR-065. No validation was executed during rollback.

## ADR 066 — Automatic record delivery into the unchanged report application (2026-11-07)

The owner explicitly authorizes automated initial history retrieval, incremental/new or changed records, older-date backfill, deterministic sorting, syncing with the browser closed and live updates without a page reload. Manual upload remains fallback and all existing business calculations/screens stay intact. This supersedes ADR-065's no-automatic-fetch boundary only; it does not reauthorize the removed connected dashboard/lifecycle architecture.

The existing input is Amazon Unified Transaction CSV. Amazon's Finances 2024-06-19 listTransactions provides programmatic financial activity, not an exact Unified CSV export nor a universal updated-since feed. The local source driver therefore fetches bounded posted-date windows and explicit order-reference history, preserves raw records and translates supported money into the existing Unified columns. Every accepted source amount must reconcile through the original normalizer; item and aggregate transaction trees are overlapping and never both added. Unknown labels/differences remain unclassified, with account-level residuals unallocated. Source identity/time breaks sorting ties; normalized event identities survive older backfill. Item quantity is emitted once per product item. Explicit complete deferred-release references supersede originals; ambiguous release activity stays reviewable. Unsupported currency/precision keeps the previous reading rather than fabricating values. Source location and actual shipping-method gaps are not guessed.

Built-in node:sqlite (no new package) is hidden behind server/local/sync/store.ts. It holds per-credential-fingerprint source records, changed old versions, rejected-source audit text, coverage, durable next tokens and requested ranges under private .local/activity-cache/. SQLite transactions commit records and pagination atomically; only terminal source pages mark complete coverage. Stale tokens/checkpoints restart safely using source IDs. Direct cached history is never repeatedly bootstrap-downloaded. A short recent overlap catches delayed/new events; idle older unresolved order references are checked every six hours. Arbitrary historical changes outside these revisits are not guaranteed by the API; financial activity may lag 48 hours.

The backend starts its coordinator with the existing local launcher, independently of browser tabs. It requires the computer and process running; no OS service or cloud storage is installed. Fixed India EU endpoints, loopback Host/Origin guards and explicit POST intent remain mandatory. The browser receives source data, never secrets/tokens. A different configured identity uses a separate cache and reading. History requests persist so they complete with the browser closed.

The browser restores the last automatic normalized import, polls source revision, normalizes changed readings in a worker, persists one logical reading per account, and replaces React dataset state without resetting dates/costs or reloading the document. Manual imports do not blindly merge with ID-bearing API data; they remain a separate selected fallback. Older custom dates queue uncovered intervals. Progress, source errors, history coverage and delivery limitations appear in a small status strip; existing analytics pages and formula engines remain unchanged. Advertising workbooks retain their existing upload flow because SP-API credentials do not establish Ads reporting access.

Regressions are authored for coverage gaps, partial pagination, durable restart, exact money, hierarchy conservation, source upserts/sorting, stable event IDs, release links, unknown values and fallback boundaries. Tests/builds/browser/mobile/live calls remain deferred by owner instruction. No live result parity or timing claim is made. Official source contract: https://developer-docs.amazon/sp-api/docs/finances-api-v2024-06-19-reference and https://github.com/amzn/selling-partner-api-models/blob/main/models/finances-api-model/finances_2024-06-19.json .

ADR-066 delivery refinement: the local cache maintains a source revision index. After the initial reading, the browser receives only changed records and merges them by transaction ID before normalizing the complete local view. A cache without a compatible source baseline receives one full local baseline; unchanged overlap reads do not publish a new data revision. No whole-history Amazon download or browser transfer occurs on every poll.

ADR-067 correction: automatic order sales use verified order purchase dates, never financial release dates. Later released fees/refunds/reimbursements update the purchase period. Unreleased/unknown API release states stay pending, and unresolved order origins stay outside purchase-period totals with visible progress/review. The backend caches minimal order-date metadata, discovers requested purchase windows and revisits known order histories. CSV first-sale-date fallback and existing financial formulas remain. Realized released sales are a different measure from all Ordered Product Sales; parity is not promised. Tests/builds remain deferred.

ADR-068: real CSV/API reconciliation is now explicitly authorized. Missing reference history was queued/downloaded through the existing local backend. The comparison isolates date-availability gaps from monetary/category errors and retains private evidence locally. Fix S01-prefixed order validation, prevent unsupported rows from trapping pagination, and apply CSV-verified India closing/FBA/Easy Ship/reversal mappings. Diagnostic CSV origins are comparison-only; production still requires verified purchase dates. Incomplete origin/history coverage is clearly flagged, and newer pending/refund activity is not forced to match an older CSV snapshot.

ADR-069: calculations now reuse normalized headers and an order-history index across date changes. Incoming source revisions are batched about every 15 seconds. Results ready describes the last complete saved calculation; Background sync separately describes pending history/dates and new evidence. Historical completeness is not inferred from calculation completion. Existing formulas/CSV semantics remain; private frozen-input checks verify financial equivalence and record engine timings.

ADR-070 restores the owner's requested Order cycle / Report activity selector for API data, retaining cycle as default. Compact exclusion counts open a paginated reason-by-order dialog. Actual item titles replace technical financial descriptions; Catalog thumbnails are implemented and cached but current Amazon authorization denies Catalog access (Product Listing role needed). Financial sync is healthy independently. Covered initial order histories are reused rather than downloaded repeatedly; unsupported references remain reviewable. Credential/network failures now have distinct safe messages.

## Current recognition direction — 2026-11-08 (ADR-071)

The seller-facing application uses one live purchase-date view. Include recorded activity immediately, including deferred amounts, and apply later fees/refunds/reimbursements to the order's original period. Do not wait for payout or lifecycle completion. Display Orders-only identities/status independently while financial details are unavailable; source order totals are not product revenue. Retain missing-date review, source evidence, cost completeness and transfer/profit boundaries. Earlier released-only and main report-activity-mode decisions are superseded for this view. Tests/builds remain deferred until explicitly requested.

## Quiet background delivery — 2026-11-08 (ADR-072)

Keep cached/completed results visible through background API fetches and recalculation. The header indicator is sufficient for sync progress; skeletons are for first preparation without saved data and explicit user filter transitions. Skip calculations when record and order-summary content is unchanged, including JSON object-key or source collection reordering. Preserve unknown fields when comparing. New source checkpoints may be saved without claiming a new calculation time. Actual changes and mapping migrations still rebuild through the existing engine.

## Optional Netlify mode — 2026-11-08 (ADR-073)

The owner now requests hosted access without a local machine, persistent cloud seller storage or scheduled fetching. Netlify is an ephemeral API relay; all source/reading caches and sync checkpoints stay on the user's browser/device. Credentials are entered for each page session and never persisted by application code. Amazon calls occur only during explicit Connect/Sync actions; closing the browser stops the workflow. Existing local mode, manual imports and financial semantics remain available. Implementation and regression fixtures are authored; tests/build, commit/push, publishing and deployment remain deferred.
