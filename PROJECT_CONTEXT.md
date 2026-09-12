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
