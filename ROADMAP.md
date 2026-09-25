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
- [x] Completed-order cohort view with lifecycle maturity, missing-origin detection, coverage disclosure, and posted-activity fallback
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
