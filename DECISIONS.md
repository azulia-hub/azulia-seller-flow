# Seller Analytics — Architectural Decisions

This file records important decisions so future coding sessions do not silently reverse them.

## ADR-001 — Generic core, source-specific adapters

Decision:
Marketplace-specific terms such as Amazon Order, SAFE-T, Easy Ship, Flipkart Collection Fee, etc. must not appear in core analytics logic.

Reason:
The system must accept future marketplaces and unknown files without rewriting filter/aggregate/render logic.

## ADR-002 — Canonical event stream

Decision:
Normalize source reports into a canonical long/event-based representation. One source row may emit multiple canonical financial events.

Reason:
A single marketplace row may contain revenue, commission, shipping, tax, reimbursement, etc. Long events preserve all components and allow new fees without changing the schema.

## ADR-003 — Preserve unknowns

Decision:
Unknown financial events are never silently dropped.

Reason:
New marketplace fee types should not break the system or disappear from profit calculations.

Unknown events should be preserved with raw labels and classification status.

## ADR-004 — Signed money convention

Decision:
Positive = money to seller. Negative = money from seller.

Reason:
Generic marketplace net can be calculated using SUM(AMOUNT).

## ADR-005 — Settlements separated from operating profit

Decision:
Bank/settlement transfers must be tracked but excluded from operating profit.

Reason:
A settlement is movement of already-accounted money, not a new expense/revenue event.

## ADR-006 — Good return reverses COGS

Decision:
Until condition data says otherwise, returned inventory is assumed resellable and therefore reverses COGS.

Reason:
Returned goods are back in inventory and should not remain consumed cost.

Future return conditions may support GOOD/DAMAGED/LOST.

## ADR-007 — UI builds specs, engine calculates

Decision:
Users never write AWK, SQL, JavaScript, or formula code for normal usage.

UI creates structured filter, metric, aggregation, chart, and dashboard specifications.

Reason:
End users need flexibility without coding.

## ADR-008 — No eval for formulas

Decision:
Custom metrics use structured expression trees / ASTs.

Reason:
Security, validation, dependency analysis, predictable behavior, and testability.

## ADR-009 — React components contain no business calculations

Decision:
React is presentation/orchestration only.

Reason:
Business logic must remain independently testable and reusable in CLI, workers, APIs, and future frontends.

## ADR-010 — Local-first MVP

Decision:
Initial application runs on GitHub Pages/static hosting and keeps seller data inside the browser.

Reason:
Low cost, easy deployment, privacy, and no backend dependency.

Future connected/live API mode may add a backend without replacing core analytics.

## ADR-011 — Cost Master is core product functionality

Decision:
Product cost management and missing-cost detection are Phase 1 features.

Reason:
Profit analytics is unreliable without cost coverage.

Missing costs must be visible; never silently treated as zero by default.

## ADR-012 — Minimal dependencies

Decision:
Prefer stable, actively maintained libraries and hide them behind adapters/interfaces.

Initial likely stack:

- React + TypeScript + Vite
- DuckDB-Wasm when needed for larger analytics workloads
- ECharts for visualization
- TanStack Table for table behavior
- Dexie for IndexedDB
- Zod for runtime validation
- Vitest for tests

Avoid unnecessary packages for trivial utilities.

## ADR-013 — DuckDB is an implementation, not the architecture

Decision:
Core analytics interfaces must not depend directly on DuckDB.

Reason:
Allow JavaScript engine for small data and DuckDB-Wasm for larger workloads. Future engine replacement should not affect UI/core specs.

## ADR-014 — Heavy analytics in Web Worker

Decision:
Parsing, normalization, aggregation, DuckDB queries, forecasts, and expensive calculations should move to a worker when appropriate.

Reason:
Keep mobile/desktop UI responsive.

## ADR-015 — Declarative charts

Decision:
Charts are created from chart specs and precomputed data.

Reason:
Avoid one custom component per business chart and keep visualization replaceable.

## ADR-016 — Reconciliation is mandatory

Decision:
Every normalized import should compare source financial total with normalized financial total when possible.

Reason:
Analytics must be auditable and trustworthy.

## ADR-017 — Insight first, AI later

Decision:
Start with deterministic insight rules. AI can later translate natural language into specs and explain verified results.

Reason:
Numbers must come from deterministic engine calculations, not LLM arithmetic/guessing.

## ADR-018 — Mobile is first-class

Decision:
Every major flow must work on mobile: upload, filters, cost entry, metric builder, dashboard, drilldown.

Reason:
Sellers may use the product primarily from phones.

## ADR-019 — Amazon RTO classification by Easy Ship reversal

Decision:
For Amazon Unified Transaction reports, classify a refund as RTO when the same order ID has a positive Easy Ship handling-fee reversal. Classify a refund with an order ID but no such reversal as a customer return. Refunds without an order ID remain unknown.

Reason:
The report has no explicit RTO/customer-return column. The seller confirmed the Easy Ship reversal is the operational evidence that distinguishes RTO from a customer return. Classification evidence must remain visible in the UI.

## ADR-020 — Return loss and multi-SKU attribution

Decision:
Return loss is the non-negative refund-side operating outflow after adding recovered COGS and order-linked reimbursements. Only refund-row charges, positive shipping reversals, and reimbursements are included; original sale-side fees are not counted again. Returned goods are assumed resellable under ADR-006. For multi-SKU returns, shared order-level amounts are allocated in proportion to each SKU's absolute product refund value.

Reason:
This prevents returned inventory from being charged as consumed COGS, avoids double-counting original order fees, and ensures SKU-level return losses add back to order totals.

## ADR-021 — Local import history and same-period comparison

Decision:
Persist normalized imports in browser IndexedDB. Compare two imports only across the intersection of their dated coverage. Detect matching events with a canonical multiset fingerprint that excludes dataset-local IDs and source-row positions, while retaining financial, order, product, location, status, and raw classification fields.

Reason:
Large normalized reports do not belong in localStorage. Same-period comparison prevents a wider report window from being compared directly with a monthly file, while multiset matching exposes overlap and report revisions without collapsing legitimate repeated transactions.

## ADR-022 — Product-level attribution of order charges

Decision:
Attribute an operating event to a product when the event carries that SKU directly. An order-linked event with no SKU, such as a shipping charge, is attributed only when the order resolves to exactly one product SKU. Blank-SKU events for multi-SKU orders and global events such as advertising remain unassigned at product level. The product screen must expose those unassigned amounts, and its portfolio profit must reconcile them into the all-operating-events result instead of duplicating or hiding them.

## ADR-025 — Advertising attribution is an explicitly analytical view

Advertising events carrying a SKU are directly attributed to that SKU. Advertising events without a SKU remain unassigned in canonical data and financial profit calculations. Unassigned advertising must not be distributed across SKUs using sales share or another inferred weighting. SKU TACOS, ROAS, and profit after ads are unavailable unless source data directly identifies the SKU. SKU screens show profit before ads and advertising headroom while the overall business profit continues to include all advertising charges.

Account/payment type and fulfillment type are optional canonical dimensions rather than source-specific raw lookups. Advertising filters operate on these dimensions. When filtering fulfillment, events without a fulfillment value remain in scope and visible because excluding dimension-less advertising would falsely report zero spend; their attribution remains explicitly unassigned/allocated.

SKU geography is aggregated from order-level results after active report and SKU filters are applied. State and city are generic canonical dimensions. Unknown locations remain visible as their own group. Geographic sales, profit, net shipping, order count, margin, and return rates use the same order calculations as the detail table; RTO, customer-return, and unknown quantities remain separate.

The SKU advertising detail uses task tabs: Overview, Geography, and Orders. Overview shows four decision-critical metrics before optional secondary detail. Geography owns location visualization controls. Orders owns operational filters and source-event audit. This prevents filters from appearing to alter unrelated panels and keeps the mobile flow understandable.

Reason:
This prevents an unsupported estimate from appearing to identify which product consumed advertising. Keeping unresolved activity visible preserves auditability and explains why the sum of assigned product profits can differ from portfolio profit. A future Amazon Ads report import may supply direct SKU or ASIN attribution.

## ADR-026 — One metric-to-SKU drilldown contract

Decision:
Home metrics open a declarative metric ranking by SKU. Selecting an assigned SKU opens one reusable workspace containing its financial overview, trend, state/city performance, and order/source-event detail. Additive amounts that cannot be reliably attributed to one SKU appear as an explicit Unassigned row and are not distributed or discarded. Ratios and averages are calculated independently and are labelled non-additive.

Reason:
This establishes a predictable Metric → SKU → Order interaction and lets future metrics reuse core selectors and one UI flow without feature-specific financial calculations.

## ADR-027 — Complete SKU workspace is an engine result

Decision:
The selected-SKU workspace is built by a pure core selector. It supplies the commercial snapshot, auditable pre-ad profit waterfall, return recovery metrics, directly attributed advertising when present, break-even advertising, and advanced order filtering. The UI only formats and renders these results. Unassigned advertising is never distributed across products.

Reason:
Keeping the complete product explanation behind one deterministic contract prevents different pages from implementing conflicting SKU profit, return, or advertising calculations.

## ADR-028 — Investigation-first navigation

Decision:
The primary seller journey is Dashboard → Metric → SKU → Order. Desktop navigation uses a compact top bar for Dashboard, Reports, and Data & Settings; mobile uses the same three destinations in bottom navigation. Product, return, advertising, and geography analysis are contextual drilldowns rather than competing top-level destinations. Global filters contain only report-wide dimensions; product, location, and payment filters belong in the relevant deeper workspace. Every drilldown level provides an explicit back action.

Reason:
Sellers investigate business outcomes by starting with a metric and tracing its product and order causes. A single progressive path reduces duplicated screens, preserves context, uses wide screens efficiently, and remains understandable on mobile.

## ADR-028 — Report-anchored time-period comparisons

Decision:
Relative period presets are anchored to the latest dated activity in the active report, not the device's current date. A selected period is compared with its immediately preceding equivalent period. The engine returns exact ranges and data-coverage status, and the UI must visibly distinguish full, partial, and unavailable coverage.

Reason:
Uploaded marketplace reports are often historical or incomplete. Report anchoring keeps options such as “this month” meaningful, while visible coverage prevents a partial report from appearing to be a complete period comparison.

## ADR-029 — Posted-time demand analysis

Decision:
SKU and order-list timing analysis uses the timestamp of the positive product-revenue sale event, falling back to the order timestamp only when needed. It counts each sale order once, derives local calendar dimensions in the reporting timezone (`Asia/Kolkata` for the current Indian marketplace adapter), and compares the selected global period with its immediately preceding equal period. Order-list filters are applied identically to current and previous datasets. Unusable timestamps are counted and disclosed instead of discarded.

The core returns declarative weekday, hour, relative-week, and weekday-by-hour results for orders, units, sales, pre-ad profit, and returns. UI components only select and render these results. Source-event detail retains the original posted timestamp for auditability.

Reason:
Marketplace transaction reports contain multiple rows per order and later refund timestamps. Anchoring demand timing to the original positive product sale prevents fees and refunds from inflating order counts or moving demand into the wrong hour. Equal-period comparison and explicit timezone conversion make patterns understandable without embedding marketplace rules in visualization code.

## ADR-030 — Explainable SKU Action Board

Decision:
Replace the multi-encoding SKU performance scatter matrix with an exhaustive action board. Active SKUs are assigned once to Stars, Growth opportunities, Margin pressure, or High risk using visible portfolio-median sales and profitable-margin benchmarks plus a visible return-risk threshold. Loss-making and high-return SKUs take priority in High risk. Each result carries its classification reason and supporting commercial metrics, and all groups retain the standard SKU click-through.

Reason:
Non-technical sellers should not need to decode axes, dot size, colour, and quadrant position simultaneously. Explicit groups, thresholds, reasons, and recommended actions make the same portfolio analysis understandable and auditable.

## ADR-031 — Concentration and explicit profit ranking

Decision:
Replace relative performance quartiles with business-concentration indicators and explicit profit rankings. Concentration reports the top-five share and the number of SKUs required to reach 80% for positive sales and positive profit. It also returns the exact contributing SKUs with individual and cumulative percentages so each result can be audited and opened. Losses are excluded from “profit generated” denominators. Top and low performers are ranked by profit, labelled as such, and kept non-overlapping when fewer than ten active SKUs exist.

Reason:
Quartile counts do not identify products or suggest an action. Concentration reveals dependency risk, while named profit leaders and laggards give sellers a direct investigation path without an opaque composite score.

## ADR-041 — Declarative chart interaction

Decision:
Reusable charts receive precomputed labels, series, value formatters, and optional selection callbacks. Hover, pointer, keyboard focus, and click/tap all expose the same point evidence. A chart may request navigation or filtering through its callback, but it does not calculate business metrics or directly own application state.

Reason:
Consistent interaction makes charts understandable and accessible without coupling visualization code to marketplace rules or duplicating analytics logic. It also lets future charts participate in the Dashboard → Metric → SKU → Order investigation flow through a small, replaceable contract.

## ADR-042 — Reduced-motion-safe interface animation

Decision:
Interface motion uses shared CSS timing tokens and short entrance, state-change, chart, and drilldown transitions. Motion remains presentational, introduces no runtime dependency, must not delay user actions, and is disabled to effectively zero duration when the operating system requests reduced motion.

Reason:
Subtle motion improves hierarchy and continuity during the investigation flow, while centralized timings prevent inconsistent effects. Respecting reduced-motion preferences keeps the application accessible and avoids making animation a prerequisite for understanding state.

## ADR-043 — Persistent accessible color theme

Decision:
The shared application shell owns an explicit dark/light preference, persists it locally, and applies it at the document root before React starts. Theme differences are presentation tokens and CSS overrides only; analytics and feature components remain theme-independent.

Reason:
A global root theme prevents feature-specific styling logic and reduces reload flashes. An explicit, persistent choice is predictable for non-technical users, while native `color-scheme` keeps browser controls consistent with the selected appearance.

## ADR-044 — Completed-order cohort performance

Decision:
The selected performance period identifies orders by their original positive product-sale date. A pure lifecycle selector gathers every order-linked event available in imported history, including later refunds, fee reversals, and reimbursements. Orders with deferred activity or insufficient follow-up coverage are excluded from completed-order metrics, as are in-period refunds and charges whose original sale is absent. Exclusion never deletes canonical events: posted-date activity remains available as the reconciliation view. Account-level events without an order ID remain in the selected posted period and are disclosed separately from order lifecycle evidence.

The initial configurable observation window is 20 days after the original sale, or 20 days after the latest refund when a return exists. Upload guidance asks for at least 20 days of history before and after the intended analysis period. The UI must disclose completed-order count, incomplete cycles, missing-original-sale cycles, and sales-value coverage.

The completed-order summary opens an auditable excluded-orders snapshot. It lists only immature, deferred, or missing-origin cycles. Excluded sale, net charge, refund, reimbursement, deadline, status, and reason values are calculated by the core selector; React only filters and renders those results. Refunds on incomplete or missing-origin cycles are explicitly reported as not yet included.

Reason:
Posted-date reports can place a prior month's refund into the current month and a current month's return or reimbursement into a later month. Selecting the sales cohort first prevents those timing differences from distorting order performance, while retaining a parallel posted-activity view preserves complete financial reconciliation and auditability.

## ADR-032 — Inline order investigation

Decision:
Order investigation expands directly beneath the selected table row. Only one order can be expanded at a time, and selecting it again collapses it. The inline result is produced from a pure order-audit selector and contains a summary, profit bridge, return evidence, fee groups, chronological source events, operating running balance, and data-quality warnings. Desktop and mobile use the same inline flow with responsive stacking.

Reason:
Opening details below the entire table loses the row context, while a drawer moves the user away from the position they selected. Inline expansion keeps the order and its explanation visually connected and preserves the Dashboard → Metric → SKU → Order investigation model.

## ADR-033 — Composable selected-SKU workspace

Decision:
The selected-SKU workspace is composed from focused commercial-overview, geography, and order-investigation components. Each component consumes typed results from pure core selectors and may own only presentation state such as the selected geography level, table filters, or the expanded order. The parent metric drilldown coordinates navigation and supplies the selected SKU; it does not duplicate the sections' rendering or financial logic.

Reason:
Separating the workspace by investigation task keeps the progressive Metric → SKU → Order flow understandable while allowing individual sections to evolve, be tested, or be reused without growing one fragile feature component.

## ADR-034 — Unified report trust center

Decision:
Reports expose one deterministic data-quality result covering financial reconciliation, unclassified operating activity, missing product costs, duplicate and overlapping imports, transaction release status, unattributed charges, and contextually required identifiers. Global financial events are not incorrectly treated as missing SKU/order identifiers. Evidence rows remain linked to their raw source labels and actions route to classification, cost, comparison, or record-review workflows.

Reason:
Sellers need a single place to establish whether dashboard numbers are trustworthy. A pure core result keeps checks consistent across future interfaces, while source-evidence fingerprints ensure saved-report overlap remains stable after a user changes classification rules.

## ADR-035 — Deterministic fee audit and evidence path

Decision:
Fee anomalies are produced by a pure canonical-order analyzer using explicit, visible rules: fee share at or above 35%, fees exceeding order profit, missing or partial shipping reversals on refunded orders, repeated fee evidence, and material commission-rate changes against a SKU median with sufficient observations. Flagged charges represent review exposure, not automatically recoverable leakage. A missing shipping reversal never independently changes the normalized return classification. Results follow Dashboard → affected SKU → flagged order → source events and compare the active period's fee rate with its preceding equal period when available.

Reason:
Fee auditing must be explainable and must not turn statistical suspicion into a financial fact. Preserving the canonical return evidence and linking every warning to source transactions lets sellers verify potential leakage without introducing marketplace terminology into generic analytics.

## ADR-036 — Effective-dated product cost history

Decision:
Product costs are stored as SKU records with an optional effective-from date. For a dated transaction, the active cost is the latest dated record on or before that date; an undated record is used only as a fallback. If neither exists, the transaction retains explicit missing-cost status under the configured policy. A refund reverses COGS using its related original sale date when that sale is present in the analyzed data. Applied cost, effective date, quantity, and COGS remain visible in order evidence. Existing undated browser records migrate as fallback entries.

Reason:
A single current cost rewrites historical margins whenever supplier prices change. Effective dates preserve period-accurate profit, while the fallback and missing-period rules prevent silent zero-cost assumptions. Sale-date refund reversal ensures a later price change does not create artificial profit or loss when returned inventory becomes available again.

## ADR-037 — Bulk product-cost updates are previewed transactions

Decision:
A bulk cost edit is expressed as a typed specification containing selected SKU identities, set/increase/decrease mode, value, effective date, and explicit overwrite permission. A pure core operation returns proposed records, per-SKU before/after values, conflicts, missing base costs, validity, and canonical COGS impact. The UI cannot apply an invalid batch and requires user confirmation after preview. Applying a batch saves it atomically and retains one prior snapshot for immediate undo during the session.

Reason:
Bulk edits can materially change profit across many orders. Typed previews and explicit replacement consent make the operation auditable, prevent missing costs from becoming implicit zero bases, and avoid partial saves that leave the cost master inconsistent.

## ADR-038 — Delivered-unit profit and break-even advertising ceiling

Decision:
Profit per delivered unit is profit after advertising divided by net delivered quantity (sold quantity less returned quantity). Break-even TACOS is the non-negative profit before advertising divided by gross sales. Both metrics require complete product-cost coverage; profit per delivered unit is unavailable when net delivered quantity is not positive, and break-even TACOS is unavailable when gross sales is not positive. Marketplace-wide break-even TACOS includes all advertising when deriving profit before ads. SKU break-even TACOS uses attributable pre-advertising economics and does not fabricate an advertising allocation when source data has no SKU attribution.

Reason:
These measures answer two practical questions without hiding denominator or attribution problems: how much profit each retained unit produces, and what percentage of sales could be spent on advertising before profit reaches zero. A shared pure selector keeps the formulas identical across dashboard, product, SKU, order, drilldown, and export surfaces.

## ADR-039 — Audit export separates source proof from filtered analysis

Decision:
The audit export is a multi-sheet, Excel-compatible workbook assembled by a pure core selector and serialized by a browser adapter. It contains report/filter context, business metrics, SKU profitability, order calculations, return classification, fee evidence, reconciliation checks, and preserved unclassified events. Source-to-normalized reconciliation is labelled as a complete-import check because arbitrary filters cannot reconstruct a source-row total from split canonical events. The filtered selection instead proves its canonical partition and operating-profit boundary, with settlements disclosed separately.

Reason:
A filtered dashboard must be shareable without overstating what has been independently reconciled. Separating full-source proof from selected canonical checks preserves financial integrity while providing accountants and sellers the evidence needed to trace every exported result.

## ADR-040 — Versioned local backup is a launch requirement

Decision:
SellerFlow exports saved normalized reports, effective-dated product costs, and classification rules as a versioned JSON bundle. Restore validates product identity, schema version, collections, report shape, costs, and rules before replacing browser state. The settings screen discloses that restore replaces current local data. Production releases run type checking, unit/integration tests, build, and browser journeys through CI; public deployment artifacts must never contain seller reports.

Reason:
Local-first storage protects privacy but can be cleared by the browser or user. A portable, validated backup prevents that privacy choice from becoming silent data-loss risk, while sanitized automated tests and deployment gates protect releases without exposing seller information.

## ADR-023 — Task-oriented application shell and progressive disclosure

Decision:
The primary interface is organized around five seller tasks: Home, Products, Returns, Reports, and Data & Settings. Report upload, validation, history, and comparison belong in Reports; cost maintenance and calculation preferences belong in Data & Settings. Analytics pages share a single filter surface. Home presents the six decision-critical metrics first and keeps supporting financial metrics behind an explicit details control. Desktop and mobile navigation use the same typed page registry.

Reason:
Task-oriented navigation and consistent page anatomy make the application understandable to non-technical sellers. A reusable shell and typed navigation registry also let future features be introduced without expanding one feature-specific page or duplicating responsive behavior.

## ADR-024 — Reusable user classification rules

Decision:
User classification rules match the normalized source identifier and exact normalized raw transaction label. A rule assigns the canonical event kind and operating/settlement class. It may supply a money type only when the event's money type is currently UNKNOWN; known money types are preserved. Rules are stored locally, applied as an immutable enrichment after source normalization, and can be removed. Applying a rule must preserve event identity, count, raw evidence, and monetary totals.

Reason:
Marketplaces introduce new transaction labels over time. Source-scoped rules let sellers resolve those labels once without placing marketplace terminology in the generic core. Preserving known money types and reconciliation totals prevents a broad raw-label rule from damaging already-understood financial components.
