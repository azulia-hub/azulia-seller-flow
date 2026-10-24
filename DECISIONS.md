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

## ADR-044 — Completed-order cohort performance (superseded by ADR-045)

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

## ADR-045 — Sponsored-product reports enrich but never replace financial truth

Decision:
Amazon Sponsored Products Advertised product workbooks are optional advertising enrichment. Unified Transactions remains the sole source for gross sales, booked advertising expense, operating profit, refunds, and reimbursements. Enrichment is enabled only when the advertising workbook completely covers the selected analysis range; otherwise the application shows Unified-only results. The workbook's advertised SKU connects a Unified SKU to its advertised child ASIN. ASIN is the displayed marketplace product identity, while SKU remains the join key until the financial source supplies ASIN directly.

The report's pre-tax spend is loaded with a configurable 18% GST assumption for product attribution and reconciled to the Unified advertising charge. Matched cost is assigned only to directly matched SKUs; unmatched spend and any reconciliation residual remain explicitly unassigned. If loaded report cost exceeds the Unified financial charge, allocations are proportionally capped at the Unified total. Seven-day attributed sales are an analytical subset of Unified gross sales and are never added to it. Estimated organic sales equal Unified sales less advertised-SKU attributed sales, floored at zero and labelled as an estimate. “Other SKU” attributed sales remain cross-sell/unassigned because the Advertised product report does not identify the purchased SKU or ASIN.

Reason:
Adding attributed sales to Unified sales would double-count revenue, while replacing Unified advertising charges with campaign spend would break financial reconciliation and omit tax or timing adjustments. Strict coverage, direct identity evidence, and explicit residuals provide useful SKU/ASIN advertising analysis without presenting attribution-window estimates as accounting facts.

## ADR-046 — Joined SKU advertising economics with evidence-based tax

Decision:
Supersede ADR-045's automatic 18% GST, proportional spend cap and inferred organic sales. Sponsored Products reported pre-tax spend remains unchanged even when it exceeds booked Unified advertising expense. Advertising analysis uses the selected posting period independently of the older completed-order dashboard view. Financial sales, fees and historical COGS are joined with advertising rows through exact SKU identity or an unambiguous source-adapter alias; punctuation is not discarded. ASIN is display evidence, not a replacement join key.

Pure core selectors calculate aggregate and per-SKU ACOS, attributed ROAS (both using total attribution including disclosed cross-sell), TACOS, CPC, CTR, conversion, cost per attributed order, per-sold/retained-unit advertising costs, campaign/day evidence and a profit bridge. Product profit restores any booked SKU advertising before deducting report spend once. Missing costs block definitive joined profit, including under the legacy assume-zero policy. Ratios with non-positive denominators remain unavailable. Marketplace fees, shipping reversals, reimbursements, unknown adjustments and existing source-tax policy retain their existing treatment; settlements never enter profit.

Advertising GST is unknown by default. A seller may enter an actual amount and invoice/evidence reference for the active financial report, advertising report and exact selected dates. Product tax allocation requires explicit consent and uses share of report spend, including unmatched products. Cumulative paise rounding preserves the entered tax total; unassigned tax stays visible. Tax evidence is session-only and is invalidated by report/date changes. This is an analytical allocation, not proof of SKU tax or tax recoverability; it does not change canonical data or business booked totals. Invoice parsing and automatic tax classification remain future work.

Account-level charges without SKU/order identity, unknown classifications, unmatched/ambiguous advertised SKUs, unassigned GST and signed financial differences remain visible. Differences are not labelled as tax or recoverable costs. Account/fulfillment filters disable enrichment with a specific explanation because advertising rows lack those dimensions. Observed first/last advertising dates gate coverage, without claiming proof of missing zero-activity days.

Verification:
Synthetic tests use hand-calculated financial examples. An opt-in private integration check compares production selectors against independent Python XML/Decimal controls at total and every advertised-SKU level, plus full-import monetary reconciliation. Private inputs/control files remain outside tracked artifacts. Desktop/mobile browser journeys verify numbers, missing costs, GST allocation and evidence downloads.

## ADR-047 — Amazon signed refund quantities are returned-unit magnitudes

Decision:
The Amazon adapter converts refund quantities to non-negative magnitudes while preserving raw quantity and signed monetary components. Some exports encode a returned unit as `-1`, while others use `1`. Canonical refund event kind controls COGS reversal; source quantity sign must not reverse it again. Regression coverage proves identical returned units, zero net COGS for a fully returned sale, and unchanged financial reconciliation for both encodings. Previously saved signed-quantity imports require reimport to apply this adapter correction.

## ADR-048 — Advertising defaults to shared dates and evidenced products

Entering Advertising with the financial report's default Entire report selection chooses the intersection of financial and advertising coverage and displays the resulting custom dates. Explicit custom ranges remain unchanged; uncovered dates and unsupported dimensions show actionable reasons rather than “No SKU ad data.” A visible action selects shared dates and clears unsupported dimension filters. No overlap still disables enrichment; no missing spend is fabricated.

The product table defaults to SKUs actually matched to uploaded advertising rows, including zero-spend rows. A selector exposes all financial products; those without advertising rows are labelled accordingly. Booked-only evidence, missing sales/spend denominators, coverage gaps and unsupported filters have distinct labels. Unmatched advertised SKUs remain in their existing review rather than being discarded or guessed. Desktop/mobile regressions reproduce a long financial report with a shorter ads report and verify date recovery, matched rows and the all-products selector.

## ADR-049 — Two-report product contribution, with no advertising GST allocation

Decision (explicit seller instruction):
Use Unified Transactions and Sponsored Products only for this workflow. Do not ingest SKU Economics into the current feature. Remove the optional GST entry, proportional tax allocation and tax-inclusive SKU profit outputs introduced by ADR-046. Preserve reported pre-tax Sponsored Products spend without scaling to booked charges.

Display “Product contribution after reported ads” as Unified SKU operating result + any booked SKU advertising already deducted - historical net COGS - reported Sponsored Products spend. Missing costs make this result unavailable even under the legacy assume-zero policy. Preserve existing source tax, fee, refund, reimbursement, unknown-adjustment and entered product-cost treatment. Explicitly exclude advertising GST, unassigned account expenses and advertising outside the uploaded Sponsored Products report; do not label this result fully GST-exclusive or final business net profit. Source product sales exclude separately reported sales tax; attributed sales are never added to those financial sales.

The existing overall business-profit calculation continues to use Unified booked advertising expense with its existing source treatment. Never subtract Sponsored Products spend again from that business result. Booked expense less reported pre-tax spend is a source difference, not inferred GST. Contribution evidence exports contain formula, exact period and exclusions. Existing exact/shared-date behavior, conservative SKU matching and unmatched/unknown evidence remain.

This supersedes ADR-046's referenced GST allocation and related profit labels. Historical entries remain as decision history, not current behavior.

## ADR-050 — Advertising integrated into Dashboard → SKU → Order

Decision (seller clarification):
Keep the original Dashboard, Reports and Data & Settings primary navigation. Business overview and Advertising are views within Dashboard. Both financial metric drilldowns and advertised-product selections use the same reusable SKU workspace with Overview, Advertising, Geography and Orders tabs. Advertising opens its tab directly; financial entry opens Overview. The selected SKU remains the same across tabs, preserving order investigation state. Tab navigation supports keyboard arrows and Home/End, and scrolls on small screens.

The common workspace composes existing pure-selector results and shared presentation components; it does not introduce a second financial engine. Overview and order evidence retain their financial calculation context. Advertising explicitly uses the selected posting dates and the contribution policy in ADR-049. SKU-level Sponsored Products spend must not be divided into order profit without order attribution evidence; the order tab explains this boundary. SKU Economics remains outside this feature.

## ADR-051 — Seller workflow replaces report navigation

Supersedes ADR-050's dashboard and SKU report tabs. The dashboard presents overall financial results, overall advertising results, and one searchable product list. Product selection opens a continuous profile: sales/returns, advertising and contribution, then source orders. Essential product metrics never require an advertising button or tab. Campaigns, attribution explanations, financial bridges, geography and advanced order filters remain accessible through progressive disclosure. Order lists show eight essential columns; expanding a row retains the complete financial audit.

Financial calculations from ADR-049 remain unchanged. Booked expense belongs to business profit; reported pre-tax spend belongs to advertising performance and product contribution. Missing costs, uncovered periods and unmatched evidence remain explicit. Selecting shared dates switches to posted activity so financial and advertising periods align; explicit selections are not silently changed. Mobile uses the same hierarchy with two-column metrics and horizontally scrollable tables.

## ADR-052 — Explicit financial context and focused seller workflows

Decision (seller instruction):
Use “Business profit” for the existing overall operating result after historical product costs and booked advertising, with visible settlement exclusion and missing-cost estimation status. Use “Product contribution” for ADR-049's product result after reported ad spend; retain its advertising GST/account-expense exclusions. “Ad ROAS” always means attributed sales divided by reported spend. Financial sales/booked-expense ratios use explicit descriptive labels.

When Sponsored Products is available, the combined product list uses posting-period financial results for sales, returns, costs and contribution. Direct product selection preserves that posting basis, including products absent from the sales-period cohort. Metric investigations retain their selected financial basis; financial and advertising sections identify their context separately. Missing posting-period financial activity must never fall back to sales-period financial amounts when calculating advertising contribution. Existing monetary formulas, canonical events and reconciliation boundaries are unchanged.

Reconciliation success is labelled as financial totals matching the source, explicitly scoped to the complete import. Import success does not claim all advertised SKUs are matched; matching counts identify their selected dates. “Sales-period view” describes the existing completed-order cohort without implying verified delivery. Canonical return types get readable display labels while raw evidence remains intact.

Filters start collapsed with visible dates and calculation basis. Clear all explicitly restores the full financial report, all dimensions and the default sales-period basis, and dismisses shared-date Undo state. Remove the duplicate dashboard product chart and Settings introduction cards. Keep broader portfolio analysis behind a disclosure after the selected metric's ranking. Backup explicitly lists its included data, excluded advertising/preferences, and the fact that restoring leaves the separately stored advertising report unchanged.

## ADR-053 — Report search and live product-cost entry

Decision (seller instruction):
Search indexes the active financial report across all dates, independently of dashboard filters. Pure TypeScript selectors produce product/name/SKU, order, location and account-transaction documents, including unknown and undated evidence. Advertising identity aliases are optional configuration; source-normalized aliases attach only to an unambiguous financial SKU. Search reports full match counts while bounding displayed results. Order/location/account results open source evidence without changing dashboard filters. Product result actions explicitly state that opening them uses all report dates and posting-date view.

Every product workspace offers inline unit-cost entry with an optional effective date. Valid input updates a session preview shared by all cost-dependent analytics, including financial/product/order results and reported-ad contribution. Input never mutates canonical evidence. Blank, invalid or negative values do not become implicit zero costs; zero must be entered explicitly. A pure cost-record operation replaces only the selected normalized SKU and effective period, preserving unrelated SKUs and dated history. Blank effective date is the existing fallback policy, not an override of dated costs.

Saving persists through the existing product-cost store and recalculates from saved state. Cancel or leaving the product discards unsaved preview. Saved costs use a compact editable disclosure; missing-cost entry opens automatically. Live readouts identify their financial basis, and reported-ad contribution remains on posting dates. Costs cannot fabricate missing advertising activity, identities, sales or classifications. No new dependency or backend is introduced.

## ADR-054 — Seller workspace and measured performance correction

Decision (seller instruction to address slow/buggy workflows and use established seller dashboards as design references):
Replace the three-destination presentation with explicit Dashboard, Products, Advertising, Returns, Product costs, Reports and Settings destinations. Desktop uses a stable sidebar and header search; mobile uses primary bottom destinations plus a navigation drawer. Dashboard shows compact comparable KPIs, visible source/cost checks, a sales trend beside a financial breakdown, and a bounded product table. Products supports title/SKU search, status/sort controls and pages; cost history and bulk selection have bounded rendering. Settings holds preferences/backup; cost maintenance has its own destination. This supersedes the navigation restriction in ADR-051 while preserving its product-to-order investigation hierarchy and ADR-049 accounting boundaries.

Products open directly in a native accessible detail dialog, without first constructing a metric-ranking workspace. Metric ranking selection opens that same product dialog. Global-search product results open a full-report product context while leaving dashboard dates and filters unchanged; the context and return destination are explicit. This supersedes ADR-053's global date-switch behavior for product search. Order/location evidence likewise preserves dashboard context. The active saved report, date selection, fulfilment filter and calculation basis restore on refresh. Missing follow-up coverage is a visible recoverable state, not an apparently empty dashboard with hidden exclusions.

Core performance work groups canonical events once for product analysis, shares indexed effective-date cost resolvers across orders/products/returns, and rebuilds only cost-affected SKU summaries during live preview. The resolver preserves source normalization, fallback/date precedence, explicit zero, and missing periods. Cost drafts use deferred presentation with an updating state; cancel/invalid input restores saved calculations without a stale draft. Hidden heavy chart/portfolio disclosures and report comparison/quality analyses no longer execute unnecessarily during ordinary product interaction. Indexes are scoped to an analysis invocation; core has no mutable global analytics cache, browser API or dependency.

Financial correction: daily SKU profit trends now reuse original-sale cost resolution from the full analyzed SKU context. A later refund after a cost-price change reverses the original sale cost in both the total and daily trend. Canonical amounts, settlement exclusion, unknown events and reported/booked advertising boundaries remain unchanged. One-point charts render a visible point. Bulk-edit confirmation is invalidated when selected products or preview inputs change.

Verification includes optimized-versus-individual SKU parity for unassigned and multi-SKU order charges (including blank identifiers), historical refund trend tests, incremental preview equivalence, full browser journeys, and a reproducible synthetic benchmark. Reference sites inform layout, not financial formulas or source-data assumptions.

## ADR-055 — Dedicated product pages and compact cost editing

Supersedes ADR-054's product dialog and ADR-053's automatically expanded, dated inline editor. Products open as a full page inside the existing workspace, with product identity, performance metrics, trend, advertising and order evidence. Hash history supports static hosting and Browser Back/Forward. The originating list stays mounted while hidden so search, status, sort and pagination survive; Back restores its scroll and focused product. Search products retain full-report scope without changing dashboard filters.

Unit cost starts as a compact Add/Edit control beside the product identity. Editing reveals one currency input with Save/Cancel and a live unsaved preview. The quick editor changes only the undated fallback; existing dated records retain precedence and remain intact. Effective dates, bulk maintenance and history belong in Product costs. Blank/invalid input never implies zero, and leaving the product discards previews. Financial selectors, missing-cost policy and accounting boundaries are unchanged.

## ADR-056 — Azulia branding and date-aware product recovery

Use the supplied Azulia gold/charcoal logo, isolated onto transparency, in workspace navigation, mobile identity, onboarding and browser icons. Preserve the source image; serve a small WebP in the UI. Warm ivory/charcoal surfaces and accessible gold action/selection tokens support both themes; profit/loss retain separate semantic colors. No dependency is added.

Fix product advertising recovery at its scope boundary: applying shared dates keeps the same product open and changes its selection to the posted-date scope. Product searches continue to find evidence across the whole report; opening a product respects explicitly selected dates, while All dates retains full-report scope. Search result actions disclose the destination scope, and product headers show the applied dates. This supersedes ADR-054's unconditional all-report product search destination. Source order/location/account evidence remains report-wide. Shared-date recovery still clears unsupported dimensions and selects posted activity; accounting and coverage validation are unchanged. Product-level Add report/Upload another report must navigate out of the product to Reports.

## ADR-057 — Theme-safe evidence and visible small choices

Fix the legacy Returns card gradients and order hover/selection backgrounds at the presentation layer. All Return snapshot cards use the active neutral panel/text/border tokens with restrained semantic edge markers. Order hover/selection uses the active selection token so source identifiers and financial values remain readable. Return rule/donut surfaces follow the active theme too.

Small fixed choices should be visible native radio groups rather than dropdowns: report search mode, product status, calculation basis, return type and short order activity/return/profitability filters. Radio groups have unique names, readable labels, checked state and keyboard focus. Long/dynamic selectors (date presets, sorting, geography and other dimensions) remain native selects; costly secondary investigations and advanced filters retain disclosures. No financial logic or filter semantics change, and no dependency is added.

## ADR-058 — Explicit report-search modes

Expose All, SKU, ASIN, Title, City, Order and Location as visible choices above the query. Field-specific search matches only the requested field: product SKU/source SKU aliases, configured product identities (presented as ASIN), product titles, location city only, order IDs only, or combined city/state locations. All retains the existing report-wide search. Core uses generic identity terminology and conservative unambiguous alias mapping; it does not infer missing identities. Search results retain existing source evidence and date-scope behavior. Each mode has a matching placeholder and empty-state explanation.

## ADR-059 — Plain profit label, continuous products and brand entrance

Rename the seller-facing Product contribution label to Profit after ads, retaining the exact reported-spend calculation, missing-cost guards and visible exclusions for advertising GST/shared business expenses. It remains distinct from overall Business profit; internal financial identifiers/formulas are unchanged.

Product results use a continuous report with titled sections and jump links rather than accordions. Advertising metrics/calculation/campaign/day evidence, costs/returns, customer locations and sales timing become visible as the user scrolls. Heavy sections mount near the viewport through ContentSection, preserving lazy work without a click requirement. Tables have bounded scrolling. Order filters are visible: short dimensions use radios, longer dimensions use exact-name inputs, and non-variable dimensions are omitted. Timing metric uses visible choices. Source order rows still expand in place for individual evidence.

On the first opening per tab session, the transparent Azulia logo appears centrally, moves to the visible sidebar/mobile brand position and reveals the workspace in roughly 1.1 seconds. Report loading proceeds independently. Reduced-motion preferences bypass the entrance; resize, asset failure and an 1.8-second fallback reveal content immediately. No animation dependency is added.

## ADR-060 — Evidence-led concentration priorities

Add Where to focus below Dashboard's primary metrics. Three cards expose sales concentration, product losses and return losses; visible Sales/Losses/Returns/Ads/Campaigns choices select a shared ranked chart/table. Pure TypeScript selectors compute positive-amount totals, row/cumulative shares, the smallest ranked group reaching at least 80%, and the actual share represented by the top fifth. No fixed 20/80 outcome or growth claim is assumed. Display real counts and percentages, including small groups that depart from 20/80.

Financial sales/loss/return views retain Dashboard's selected financial scope. Product losses use complete-cost profit before unassigned advertising/shared expenses, separately from profitable products. Return losses use the existing order-level loss after recovery/reimbursement; groups with missing costs and entries lacking product identity are excluded with a warning. Product and return losses overlap and must not be added. These rankings do not allocate unassigned account charges.

Ads/campaigns use selected posting dates only when advertising coverage/dimensions are supported. Spend is ranked as spend, not automatically labelled waste/loss. Product rows show ad-attributed sales and existing profit-after-reported-ads where supported; unmatched spend remains as explicit non-navigable evidence. Campaign groups preserve portfolio/name identity and aggregate actual source spend/attributed sales. Campaign review shows constituent products, withholding product navigation for unmatched identities. No campaign profit or incremental return is inferred.

Rows are bounded with explicit more actions, mobile rows retain labels, and selected focus area survives product review. Focus/return analysis is limited to the active Dashboard, excluding open product pages. No dependency or canonical accounting change is introduced. Regression cases are added but execution is deferred by explicit user instruction.

## ADR-061 — Advertising focus compares sales output with spend

Supersedes ADR-060's spend-only Ads/Campaigns candidate selection. Compare each entity's share of reported spend with its share of ad-attributed sales across the complete known advertising group in the selected dates. Review candidates have positive spend and one of: zero attributed sales, spend exceeding attributed sales, known negative product profit after reported ads, or spend share exceeding sales share. A high budget with proportionate sales and no known loss is not flagged. Campaigns do not infer product-cost profit.

Rank only flagged candidates by actual spend. Their shares/cumulative 80% group use flagged spend as denominator; separately labelled Spend share/Sales share compare the full known group. Show ROAS and the reason for review. Relative inefficiency is a review signal, not verified waste, recoverable savings or a recommendation to cut a budget automatically. Unmatched-product sales come from selected-period source campaign rows; missing sales are not assumed zero and incomplete comparisons are excluded with a count. Canonical figures, reported/booked advertising policy and missing-cost guards remain unchanged.


## ADR-045 — Sale-period orders with released and pending activity

Decision (15 October 2026, explicitly requested by the seller):
Replace the completed-order waiting gate with **Orders sold in selected period**. Original positive product-sale dates select the orders, including deferred sales for pending disclosure. Search the entire active report for their linked activity, independent of the selected end date. Include available/released activity immediately; never remove a released sale because a later refund resets a deadline or another transaction is deferred. Less than 20 days of follow-up is informational only and never proves completion.

Explicit Deferred transactions are separated from main metrics as pending sales, refunds, fees, reimbursements, operating net, and settlement transfers. An explicitly labelled estimate combines available and pending events once and recalculates COGS under the same historical cost and missing-cost policy. Unknown/missing release statuses stay included with a visible disclosure; they are not silently discarded or claimed as verified Released transactions.

Resolve matching deferred/released records conservatively at the whole source-row level. Only otherwise identical rows, including raw references and evidence except status, can match. Preserve repeated-row multiplicity; each Released row replaces at most one matching Deferred row. Date-shifted, changed, and ambiguous rows remain separate for review. Canonical imports, raw data, reconciliation, and Posted activity are unchanged.

Missing-original-sale activity is shown separately and never assigned an invented sales month. Account-level events without an order ID use posting dates in the selected period; their pending amounts are separated too. Settlement transfers remain outside operating profit. Only the active report is searched; saved report snapshots are not silently merged.

UI shows the original sale range, observation-through date, selected-order count, pending activity, unmatched evidence, and inline release statuses. Audit workbooks disclose the calculation basis and provide pending, missing-origin, and superseded-deferred evidence sheets. Desktop and mobile share this flow.

Reason:
The 20-day gate excluded known sales and adjustments without establishing actual lifecycle completion. An observed-to-date order cohort answers how a sales period performed using all imported evidence, while explicit pending values and a separate Posted activity view preserve status transparency and financial auditability.

## ADR-062 — Installable release, system appearance and reliability audit

User authorizes installation support, full checks/review/performance fixes and pushing the completed release to main. Default appearance follows the operating system on the first visit and in the first-paint script; explicit saved Light/Dark choices remain respected.

Ship a scoped web manifest, logo-based 192/512 icons, a padded maskable icon and an iPhone touch icon. Install actions live in navigation and Settings, using the browser prompt when available and accessible browser-specific instructions otherwise. Standalone installation is detected. Production registers a service worker; development intentionally avoids worker caches. A build-time local Vite plugin precaches the shell, hashed lazy chunks and small brand assets. It uses native Node build APIs, with @types/node added only for development type checking. No PWA runtime dependency is added.

Navigation uses network-first with a scoped cached-shell offline fallback. Cache versions depend on file contents; updates wait for an explicit Update and reload action so drafts are not silently interrupted. Cache cleanup is app-scope-specific and keeps a preceding version. Source report data stays in IndexedDB/local storage and is never uploaded or added to shell caches. Offline/setup/update status remains visible.

Integrate main's sale-period correction (c54c474): all orders originally sold within the selected period remain included regardless of age, linked released activity is included, pending evidence stays separate, and deferred/released duplicates are resolved conservatively. Preserve that evidence in summaries, order details and audit export. Migrate the older saved calculation-basis identifier. The 20-day window is a follow-up indicator, never an eligibility gate.

Performance changes: index advertising sales and SKU joins once, avoid copying growing campaign/day arrays, share cost resolution within cohort analysis, omit per-order financial details until requested, and lazy-load Cost/Returns/Reports/Settings screens. Remove unused legacy advertising/order dialogs, stale cost-panel styles and unused symbols. Update Vite to the compatible audited security patch. Production PWA tests run separately from dev tests with distinct artifact directories.

## Product scenario simulator withdrawn — 24 October 2026
The user requested removal of the What if simulator. Its product-page entry, dialog, calculation engine, simulator-specific GST adapter and tests were removed. Product reporting and prior focus/ranking features are retained. Do not reintroduce the simulator without a new user request.

## ADR-063 — Money leak focus rankings (24 October 2026)
Prioritize SKU losses by absolute monetary loss after supported reported or booked SKU ads; profitable products do not offset ranked losses. Reported advertising replaces booked SKU ads once through existing economics. Missing cost/profit evidence is excluded visibly. Returns use existing recovery/reimbursement-adjusted monetary losses. Ads focus requires both TACOS strictly above 20% (reported SKU spend / same-period Unified gross product sales) and known negative profit after ads; rank by loss, not budget or percentage. Campaign review criteria remain unchanged.
Add independent Profit after ads, Marketplace charges, Easy Ship and FBA rankings. Fee rankings include only known loss-making products and net recorded charges/reversals, including return activity. FBA uses the generic fulfillment-fee classification and remains a subset of marketplace fees. Unassigned account charges are not allocated. Tables/chart labels show SKUs, monetary cumulative totals and signed green/red money. Original dashboard financial formulas and GST policy are unchanged.
