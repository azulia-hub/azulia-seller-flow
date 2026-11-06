# Seller Analytics — Roadmap

## Phase 0 — Repository / Engineering Foundation

- [x] Add AGENTS.md
- [x] Add PROJECT_CONTEXT.md
- [x] Add ARCHITECTURE.md
- [x] Add DECISIONS.md
- [x] Add ROADMAP.md
- [x] Ensure README explains how to run project
- [x] Commit package-lock.json
- [x] Add lint/typecheck/test/build scripts
- [x] Configure GitHub Pages deployment
- [x] Configure CI for typecheck + tests + build
- [x] Add browser-level regression tests for critical seller journeys and mobile order audits

## Phase 1 — Real Analytics MVP

Goal: upload an Amazon report and get a trustworthy real dashboard.

### Import & Source Detection

- [x] CSV file upload
- [x] Generic CSV parser
- [x] RawDataset abstraction
- [x] SourceAdapter interface
- [x] Amazon Unified Transaction adapter
- [x] Automatic source detection
- [x] Unknown source fallback
- [x] Raw data preview
- [x] Local import history and same-period report comparison
- [x] Real-report financial reconciliation regression suite with metric deltas
- [x] Audit workbook export for active filters with summary, SKU, order, return, fee, unknown-event, and reconciliation sheets
- [x] Versioned browser backup and restore for reports, cost history, and classification rules

### Normalization

- [x] Canonical event types
- [x] Amazon mapping
- [x] Multiple canonical events per source row
- [x] Preserve raw fields
- [x] Preserve unknown financial events
- [x] Reconciliation check
- [x] Data quality summary
- [x] Transaction review manager with reusable classification rules

### Cost Master

- [x] Local Product Cost Master
- [x] Detect missing SKU costs
- [x] Missing cost assistant
- [x] Manual cost entry
- [x] Bulk cost editing with effective dates, conflict confirmation, COGS preview, and undo
- [x] CSV/TSV and spreadsheet-paste cost import
- [x] Effective-dated product cost history, trend view, and transaction-level applied-cost evidence
- [x] Cost coverage percentage
- [x] Profit warning when cost incomplete

### Core Analytics

- [ ] Generic filters
- [ ] Generic grouping
- [ ] SUM / COUNT / COUNT DISTINCT / AVG / MIN / MAX
- [ ] Metric registry
- [ ] Formula engine
- [ ] Metric dependency graph
- [ ] Circular dependency detection

### Default Metrics

- [x] Gross Sales
- [x] Net Product Revenue
- [x] Sold Qty
- [x] Return Qty
- [x] Net Delivered Qty
- [x] Return %
- [x] Easy Ship net of reversals
- [x] Marketplace charges
- [x] Reimbursements
- [x] Ads Spend
- [x] Net COGS
- [x] Profit Before Ads
- [ ] Profit Before Ads %
- [x] Profit After Ads
- [x] Profit After Ads %
- [x] TACOS
- [x] ROAS
- [x] ROI
- [x] ASP
- [x] Profit per delivered unit
- [x] Break-even TACOS

### Dashboard

- [x] Reusable application shell with desktop top navigation and mobile bottom navigation
- [x] Investigation-first top navigation and responsive Dashboard → Metric → SKU → Order flow
- [x] Guided Reports workspace for upload, validation, history, and comparison
- [x] Dedicated Data & Settings workspace for product costs and calculation preferences
- [x] Shared analytics filters and progressive metric disclosure
- [x] Reusable interactive chart tooltips with pointer, touch, keyboard, and drilldown support
- [x] Subtle responsive motion system with reduced-motion accessibility
- [x] Persistent light and dark appearance themes
- [x] Responsive overview dashboard
- [x] KPI cards
- [x] Sales trend
- [x] Top SKU
- [x] Return analysis
- [x] Return trends, financial impact, SKU ranking, and CSV export
- [x] Ads analysis: overall TACOS, ROAS, daily trends, direct SKU attribution, and explicit unassigned spend
- [x] Optional Sponsored Products XLSX enrichment with SKU-to-ASIN identity, strict period coverage, GST-loaded spend reconciliation, attributed-sales and estimated-organic views
- [x] SKU advertising drilldown with direct-source attribution, pre-ad profit, break-even TACOS, trends, and operational order filters
- [x] SKU geographical analysis by state/city for sales, profit, Easy Ship, RTO and customer returns
- [x] Profitability summary
- [x] Full product-profitability screen with filters, rankings, export, cost coverage, and SKU/order drilldown
- [x] Data-quality widget
- [x] Unknown/unclassified event widget
- [x] Actionable unfamiliar-transaction review workflow

## Phase 2 — Explore & No-Code Analytics

- [ ] Global filter builder
- [ ] Nested AND/OR conditions
- [ ] Group-by selector
- [ ] Sort / Top N
- [ ] Explore screen
- [ ] Generic data table
- [ ] Cross-filtering from charts
- [x] Order-level profit drill-down
- [ ] Saved views

### Metric Builder

- [ ] Aggregate metric UI
- [ ] Formula metric UI
- [ ] Ratio / percentage metric UI
- [ ] Live preview
- [ ] Formatting controls
- [ ] Dependency viewer
- [ ] Duplicate/edit/delete metric
- [ ] Built-in vs My Metrics library

### Visualization Builder

- [ ] KPI widget
- [ ] Bar chart
- [ ] Line/area chart
- [ ] Stacked bar
- [ ] Pie/donut
- [ ] Scatter
- [ ] Heatmap
- [ ] Treemap
- [ ] Waterfall
- [ ] Chart configuration UI

## Phase 3 — Multi-Marketplace

- [x] Generic mapping UI for unknown CSV
- [ ] Flipkart adapter
- [ ] Meesho adapter
- [ ] Marketplace comparison
- [ ] Multi-source merged canonical dataset
- [ ] Mapping versioning

## Phase 4 — Time Intelligence

- [x] Previous period comparison with report-anchored presets and coverage status
- [x] SKU and filtered-order posted-time analysis by day, weekday, hour, and relative week
- [x] Sale-period order view searches full active-report history, includes released activity without a maturity gate, separates pending transactions and estimates, and retains unmatched evidence and Posted activity
- [x] Pending/unmatched review, inline release-status evidence, and calculation-basis-aware audit workbook sheets
- [ ] MoM
- [ ] QoQ
- [ ] YoY
- [ ] Custom date comparison
- [ ] rolling metrics
- [ ] cohort-like product performance where useful

## Phase 5 — Insights

- [ ] Rule-based insight engine
- [ ] High-return SKU detection
- [ ] Negative-profit SKU detection
- [ ] High-TACOS detection
- [ ] Cost coverage warning
- [x] shipping-cost and marketplace-fee anomaly audit
- [ ] margin deterioration
- [ ] geographic concentration
- [ ] return concentration

## Phase 6 — Forecasting

- [ ] Moving average
- [ ] Weighted moving average
- [ ] Linear trend
- [ ] Exponential smoothing
- [ ] Forecast chart
- [ ] Model selector
- [ ] Accuracy/backtest view

Later:

- [ ] Holt-Winters
- [ ] seasonality
- [ ] confidence intervals
- [ ] anomaly detection

## Phase 7 — Scenario / What-if

- [ ] Selling price simulation
- [ ] Cost price simulation
- [ ] Ad spend simulation
- [ ] Return-rate simulation
- [ ] Shipping-cost simulation
- [ ] Current vs scenario comparison
- [ ] break-even price
- [ ] break-even TACOS

## Phase 8 — Dashboard Builder

- [ ] Add widget
- [ ] Move/resize widgets
- [ ] Save dashboards
- [x] Reusable Home metric → SKU → geography/order drilldown
- [x] Composable SKU commercial, geography, and order-investigation modules
- [x] Inline order audit with profit bridge, return evidence, fee groups, and event timeline
- [x] Unified report trust center with reconciliation, coverage, overlap, attribution, status, and evidence checks
- [ ] Dashboard templates
- [ ] Export/import dashboard config

## Phase 9 — Live / Connected Data

Only after local-first product is stable.

- [ ] Backend architecture decision
- [ ] authentication
- [ ] encrypted secrets
- [ ] Amazon API connector
- [ ] Flipkart API connector
- [ ] scheduled data refresh
- [ ] cloud sync
- [ ] account-based cost master
- [ ] alerts / notifications

## Phase 10 — AI Assistant

AI must not independently calculate business numbers.

- [ ] Natural language → FilterSpec
- [ ] Natural language → QuerySpec
- [ ] Natural language → MetricSpec
- [ ] Explain metric lineage
- [ ] Explain verified period changes
- [ ] Suggest next analysis based on deterministic insight context

## Long-Term Product Possibilities

- PDF/Excel report export
- scheduled weekly/monthly reports
- inventory forecasting
- ad efficiency diagnostics
- reorder recommendations
- customer return reason clustering
- marketplace fee audit
- fee anomaly detection
- unit economics simulator
- seller benchmarks based only on user-owned data initially

## Sponsored Products SKU economics follow-up

- [x] Joined SKU advertising panel in existing metric/SKU and Advertising drilldowns
- [x] Reported pre-tax spend, ACOS, attributed ROAS, TACOS, CPC, CTR, conversion and unit-cost metrics
- [x] Profit bridge with missing-cost guard and no duplicate advertising deduction
- [x] Referenced actual-GST entry, optional explicit allocation and visible unassigned GST
- [x] Campaign/day evidence and downloadable SKU calculation evidence
- [x] Unmatched identity review and visible account-level adjustments/reconciliation difference
- [x] Independent private report control-total verification and synthetic desktop/mobile regression coverage
- [ ] Parse advertising invoices for actual tax evidence and billing-period matching
- [ ] Add ads reports and tax evidence to versioned backup/restore (ads report currently stored separately)
- [x] Merge the newer main-branch sale-period accounting fix before extending joined ads beyond posting-period analysis
- [x] Normalize signed Amazon refund units so good returns reverse COGS for either source encoding (ADR-047)
- [x] Advertising defaults to shared report dates and matched advertised SKUs, with clear coverage/filter recovery and an all-financial-products selector (ADR-048)

## Current two-report advertising policy (ADR-049)

- [x] Use Unified Transactions + Sponsored Products for product advertising contribution; SKU Economics import deferred
- [x] Remove manual advertising GST entry, allocation and tax-inclusive SKU-profit placeholders
- [x] Show product contribution after reported ads with explicit advertising GST/account-overhead exclusions
- [x] Keep overall business profit on Unified booked expense, without a second Sponsored Products deduction
- [x] Export contribution formula, source context and exclusions; retain missing-cost and date/matching guards

The earlier referenced-GST allocation item is superseded by ADR-049.

- [x] Integrate Business overview and Advertising within Dashboard while retaining the original three primary navigation destinations
- [x] Reuse one SKU workspace with Overview / Advertising / Geography / Orders tabs from both financial and advertising entry points
- [x] Link SKU advertising to existing order investigation without inventing order-level advertising attribution (ADR-050)

### Seller workflow refinement (2026-10-21)
- Dashboard embeds overall advertising results and a searchable combined product list.
- Product profiles display advertising and contribution directly alongside financial performance; source orders remain on the same page.
- Advanced report explanations, campaign evidence, financial breakdowns and order filters use progressive disclosure.

- UI density refinement: metric cards show labels and values; formulas stay in label tooltips and expandable details. Removed repeated dashboard/product descriptions and shortened primary product metric labels, retaining visible cost/tax limitations.
- Account charges moved from advertising details to financial details, using the active financial selection. Source charge/adjustment labels and signed amounts remain explicit; rows state inclusion in business profit and retain review status for unknown classifications.

### Calm presentation and dashboard hierarchy (2026-10-23)
- Light appearance is the default; Light / Dark / System preferences persist locally and System follows live OS changes.
- Neutral surfaces, blue interactions, readable typography and explicit keyboard focus replace decorative gradients and status glows.
- Dashboard leads with profit, sales, margin and returns, followed by existing data-quality actions and products before advertising. Secondary metrics and the profit bridge remain available in disclosures.
- Mobile product comparisons keep product, sales and contribution visible; all advertising metrics remain available within the product profile.
- Missing-cost estimates remain explicit beside headline profit. Financial calculations and report normalization are unchanged.

### Advertising availability guidance (2026-10-23)
- Dashboard and product profiles show exact report coverage and selected dates when advertising is unavailable.
- Shared-date action names the actual available range, explicitly switches to posted activity/all dimensions, confirms the selection and offers Undo restoring prior filters and calculation basis.
- Non-overlapping reports show both coverage ranges and an upload action. Missing report, unmatched SKU, zero-denominator ratios and missing-cost contribution have distinct explanations.
- Desktop/mobile browser regressions cover exact-date recovery, Undo, zero advertising activity and reports with no overlapping dates. Financial calculations remain unchanged.

### Seller clarity corrections (ADR-052, 2026-10-23)
- [x] Distinguish Business profit, Product contribution, total product sales, attributed sales, booked expense and reported advertising spend.
- [x] Align the product comparison and direct profile with posting-period financial results when advertising is available; preserve financial context in metric investigation.
- [x] Replace blanket accuracy and SKU-matching assurances with scoped reconciliation wording and actual matching counts.
- [x] Use readable calculation-basis and return-type labels, preserving raw source evidence.
- [x] Collapse filters with visible dates/basis; reset all dates, dimensions, basis and Undo explicitly.
- [x] Remove duplicate dashboard product chart and Settings introduction cards; move broad portfolio analysis behind More analysis.
- [x] Disclose the exact backup scope, advertising/preferences exclusions and separate advertising restore behavior.

### Search and inline product costs (ADR-053, 2026-10-23)
- [x] Report-wide search for product names, SKUs, supplied ASIN/identity aliases, orders, cities/states and account source labels.
- [x] Search scope disclosure, match counts, unknown/undated source evidence and conservative identity matching.
- [x] Product-cost entry inside product profiles and single-product order search detail, with immediate derived-metric preview.
- [x] Explicit Save/Cancel, local persistence, optional effective date, preservation of dated history, and rejection of invalid costs.
- [x] Shared draft recalculation across product, order, financial, advertising contribution, return and data-quality selectors.
- [x] Desktop/mobile regressions for search navigation, date-specific costs, live order/contribution changes, cancellation and reload persistence.

- [x] Explicit Search by → Product title mode, using preserved title/product-name/item-name columns and sale descriptions; case-insensitive word matching and title-specific empty states.

### Workspace reliability and performance (ADR-054)
- [x] Dedicated seller destinations and a responsive sidebar/drawer/bottom-navigation shell.
- [x] Header report search, compact KPIs, sales trend plus financial breakdown, and meaningful product tables in financial/advertising contexts.
- [x] Direct native product details without building an unrelated metric investigation; scope-preserving source search and clear return destinations.
- [x] Restore active report and date/basis/fulfilment selection after refresh; disclose/recover from follow-up exclusions.
- [x] Indexed cost resolution, one-pass SKU event grouping, incremental cost previews and deferred UI updates.
- [x] Lazy heavy disclosures and workflow-specific comparison, quality and audit calculations.
- [x] Bounded product/order/cost/bulk-selection rendering, product filters/sorting and searchable cost history.
- [x] Original-sale cost reversal in daily refund trends, visible single-point charts, correct mobile result-column visibility and refreshed bulk-edit consent.
- [x] Synthetic benchmark command and large-report browser responsiveness/reload regression.
- [ ] Extend performance profiling to substantially larger, representative private reports before claiming arbitrary-scale responsiveness. Synthetic 12,000-order and browser 3,000-order checks are available.

### Product page and focused cost entry (ADR-055)
- [x] Replace the product drawer with a dedicated responsive workspace page and performance-first hierarchy.
- [x] Preserve list search, status, sort, pagination, scroll and focus with Back/Forward navigation.
- [x] Compact Add/Edit unit-cost control with live preview and explicit Save/Cancel.
- [x] Keep dates and history in Product costs; quick edits preserve dated costs.

### Azulia brand and advertising date recovery (ADR-056)
- [x] Transparent logo assets, optimized app image, browser icons and responsive brand placement.
- [x] Warm ivory/gold light theme and charcoal/gold dark theme with distinct financial colors.
- [x] Apply shared dates within the current product; search-opened products respect explicit date selection.
- [x] Desktop/mobile regressions for full-report recovery and manually matched advertising dates.

### Theme consistency and simpler choices (ADR-057)
- [x] Remove legacy dark gradients from Returns cards and use theme tokens for source-order hover/selection.
- [x] Make short search/status/calculation/return/order choices visible without opening dropdowns.
- [x] Preserve native keyboard radio behavior, mobile wrapping and long-list selects.
- [x] Add desktop/mobile regressions for neutral card surfaces, text contrast, readable hover states and visible filters.

- [x] Extend theme tokens to metric investigation charts/comparison/ranking controls; use visible ranking direction choices and bounded table scrolling with sticky column headers. Validation deferred at the user's request.

- [x] Visible All/SKU/ASIN/Title/City/Order/Location search choices, scoped matching and contextual placeholders/empty states. New regression cases added; execution deferred by user instruction.

- [x] Rename Product contribution to Profit after ads with visible shared-expense/GST exclusions.
- [x] Continuous product sections, jump links and viewport-deferred heavy content replace product accordions.
- [x] Visible order filters and timing choices; short dimension radios and exact-name inputs replace product dropdowns.
- [x] Brief center-to-brand logo entrance once per tab session, with reduced-motion/error/resize fallbacks. Validation deferred at user instruction.

### Where to focus (ADR-060)
- [x] Dashboard priority cards and visible Sales/Losses/Returns/Ads/Campaigns analysis.
- [x] Pure positive-amount concentration ranking with actual counts/shares, cumulative 80% cutoff and top-fifth comparison.
- [x] Separate complete-cost product losses, return-loss evidence, unsupported coverage recovery and unmatched advertising spend.
- [x] Product/campaign review, bounded source rows and mobile labelled cards.
- [x] Add core regression cases; execution deferred at the user's explicit request.

- [x] Replace spend-only advertising priorities with spend-versus-sales comparison, supported losses, visible reasons/ROAS and flagged-spend concentration (ADR-061). Regression cases updated/added; execution remains deferred.

### Installable release and audited main integration (ADR-062)
- [x] Scoped manifest, native install/fallback actions, proper logo/maskable/iPhone icons and production offline shell.
- [x] Explicit safe update/reload, offline notice and per-app cache cleanup.
- [x] System theme by default, with saved overrides and reduced-motion behavior preserved.
- [x] Merge main's sale-period correction and preserve pending/unknown source evidence.
- [x] Advertising grouping/indexed joins, shared/deferred cohort cost work and lazy workspace bundles.
- [x] Remove obsolete dialogs/styles/imports and apply audited compatible build-tool patch.
- [x] Add production installation/offline/update and expanded focus/search/theme browser regressions.

- [x] Rank money leaks by product loss after supported reported/booked SKU advertising, with explicit evidence exclusions.

- [x] Independent profit, marketplace, shipping and fulfillment fee focus rankings; fee rankings require loss after ads.

- Product What if simulator removed at the user’s request; implementation is deferred until explicitly requested again.

### Local seller tools (ADR-064)

- [x] Report-independent Tools destination with Amazon PDF Cutter, desktop/mobile navigation and ordered multi-file selection.
- [x] Browser worker rewrite of the Python cutter: original barcode pixels, four-up A4, complete product names, ordered quantities and merged product rows.
- [x] Optional matching packing-list PDF/CSV, duplicate/layout/quantity validation, cancellation and local downloads.
- [x] Self-hosted fonts/WASM with on-demand offline caching (first run online), avoiding an approximately 11.9 MB mandatory shell download; no PDF uploads or backend.
- [x] Synthetic unsafe-input/layout tests, desktop/mobile browser flows and private original-output comparison at 72/203/300 DPI.
