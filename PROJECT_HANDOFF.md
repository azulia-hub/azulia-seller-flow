# Azulia Seller Flow — Project Handoff

Last updated: 15 October 2026
Current production version: `v1.0.2`  
Repository: https://github.com/azulia-hub/azulia-seller-flow  
Live application: https://azulia-hub.github.io/azulia-seller-flow/

## How to use this file

Provide this file when asking a new coding session to resume work. The agent must still read `AGENTS.md`, `PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, `DECISIONS.md`, and `ROADMAP.md` before changing architecture or business logic because those files contain the detailed source-of-truth rules.

Suggested resume request:

> Read PROJECT_HANDOFF.md and the mandatory project documents, inspect the current Git state, and continue from the Current priorities section. Do not change financial formulas without tests and reconciliation evidence.

## Product purpose

Azulia Seller Flow is a local-first marketplace analytics application for non-technical sellers. A user uploads transaction reports, reviews data quality, adds product costs, and investigates performance through this path:

`Dashboard metric → SKU overview → geography/time analysis → order evidence`

The platform is intended to remain generic. Amazon-specific parsing and return rules belong in the Amazon adapter; generic normalization, filtering, aggregation, costs, and metric calculations belong in pure TypeScript core modules.

## Current technical stack

- React 19 and TypeScript
- Vite production build
- Vitest unit and integration tests
- Playwright browser and mobile-flow tests
- IndexedDB for normalized report history
- Local storage for costs and classification rules
- GitHub Actions for CI and GitHub Pages deployment
- Static/local-first application; uploaded reports are not intentionally sent to an application server

## Architecture boundaries

- `src/core/`: deterministic, marketplace-neutral TypeScript calculations and data contracts.
- `src/adapters/amazon/`: Amazon Unified Transaction detection, normalization, SKU normalization, and Amazon-specific transaction interpretation.
- `src/adapters/generic-csv/`: mapping suggestions for unknown tabular sources.
- `src/adapters/browser/`: IndexedDB, local-storage, downloads, backups, and other browser integration.
- `src/features/`: page/workspace composition only; React must not calculate business metrics.
- `src/components/`: reusable presentation and drilldown components.
- `src/app/`: navigation, state orchestration, filters, and composition of engine results.

Preferred implementation model:

`DATA + SPECIFICATION = RESULT`

Never use `eval()` for formulas, silently drop unknown money, mix settlement transfers into operating profit, or leak marketplace-specific labels into generic core logic.

## Implemented data workflow

- Upload CSV and TSV reports in the browser.
- Parse tabular files with preamble/header detection.
- Automatically detect Amazon Unified Transaction reports.
- Fall back to a generic mapping screen for unknown report formats.
- Normalize one source row into one or more signed canonical financial events.
- Preserve raw source fields and unfamiliar transaction labels.
- Reconcile normalized monetary totals against source totals.
- Save normalized imports in IndexedDB.
- Reopen and compare saved report snapshots over their shared date range.
- Review unfamiliar transaction types and save reusable source-specific classification rules.
- Export an audit workbook containing summary, SKU, order, return, fee, unknown-event, and reconciliation evidence.

## Implemented product-cost workflow

- Manual cost entry by SKU.
- CSV, TSV, whitespace-aligned, and spreadsheet-paste bulk import using `SKU` and `Unit Cost` columns.
- Optional `Effective From` date for historical cost versions.
- Bulk percentage or fixed cost changes for selected SKUs.
- Impact preview, explicit confirmation, and undo for bulk edits.
- Local persistence across reloads.
- Cost-history trend and applied-cost evidence at transaction level.
- Missing-cost count and cost-coverage percentage.
- The current user preference is to assume missing COGS as ₹0, but the UI must visibly label profit as estimated and display missing-cost coverage. Never make this assumption silently.

## Financial conventions and formulas

All normalized money uses seller perspective:

- Income is positive.
- Charges and refunds are negative.
- Bank settlement transfers are tracked but excluded from operating profit.

Current dashboard formulas:

- Gross sales: positive product-sale revenue events.
- Net product revenue: gross sales less product refunds.
- Net Easy Ship fee: Easy Ship charges net of positive fee reversals.
- Marketplace charges: marketplace fees excluding Easy Ship and advertising.
- Ads spend: absolute value of transactions classified as advertising charges.
- Marketplace operating net: signed total of operating events, excluding bank settlements.
- Net COGS: cost of sold inventory less COGS reversed for assumed-good, resellable returns.
- Profit after ads: marketplace operating net minus net COGS.
- Profit before ads: profit after ads plus ads spend.
- Profit margin: profit after ads divided by gross sales.
- TACOS: ads spend divided by gross sales.
- ROAS: gross sales divided by ads spend.
- ROI: profit after ads divided by net COGS.
- Average selling price: gross sales divided by sold quantity.
- Profit per delivered unit: profit after ads divided by net delivered quantity.
- Break-even TACOS: maximum of zero and profit before ads divided by gross sales.
- Tax is currently treated as income/part of operating value and is not deducted again.

Advertising charges are not invented at SKU level. They remain unassigned unless the source supplies defensible SKU attribution.

## Amazon return classification

Amazon Unified Transaction reports do not provide a reliable explicit RTO/customer-return field. The adapter applies this evidence rule:

- Refund order with a positive Easy Ship weight-handling-fee reversal: `RTO`.
- Refund order with an order ID and no Easy Ship reversal: `CUSTOMER_RETURN`.
- Refund without sufficient order evidence: unknown return type, kept visible.

Returned goods are assumed resellable, so their COGS is reversed. Return profitability retains the associated Amazon charges, refunds, shipping charges/reversals, and reimbursements.

## Implemented application experience

- Responsive top navigation on desktop and bottom navigation on mobile.
- Main workspaces: Dashboard, Reports, and Data & Settings.
- Secondary analysis reached through metric and SKU drilldowns rather than a large sidebar.
- Global fulfilment and time-period filters.
- Default period is now **Entire report**. An August report shows August; a January–August report shows January–August.
- Dashboard calculations switch between **Orders sold in selected period** and **Posted activity**. Sale-period analysis selects original sales in the chosen dates and gathers all later linked activity from the entire active report. There is no 20-day exclusion.
- Main results exclude explicit Deferred components. Pending sales, refunds, fees, reimbursements, operating net, and settlements are disclosed separately, with an estimate including pending activity and historical COGS. A deferred fee/refund never hides a released sale. Missing/unknown release statuses remain included with a visible warning.
- The summary opens searchable Pending transactions and Original sale missing tabs with order-level financial results and full source/status evidence. Inline order details also show pending components and release status. Missing-origin activity is never assigned a guessed sales month.
- Upload guidance requests the widest available history. Follow-up under 20 days is informational only. Exact whole-row Deferred/Released matches are counted once in order analysis, preserving raw references and multiplicity; all source events remain in Posted activity and reconciliation.
- Account-level activity uses posting dates in the chosen period. Saved reports remain separate snapshots rather than automatically merged history. Audit exports disclose basis and observation date, with separate pending, unmatched, and superseded evidence sheets.
- Available preset periods are restricted by report date coverage.
- Presets include last 3/7/30 days, week/month choices, 3/6 months, and year choices where supportable.
- Custom date range and automatic equal-length previous-period comparison.
- Dashboard KPI cards open a metric overview and SKU ranking/visualization.
- Selecting a SKU opens commercial metrics, returns, fees, costs, profit, geography, time trends, and order-level evidence.
- Inline order detail opens in place below the selected row and avoids desktop-style horizontal overflow on mobile.
- Guided first-use empty state and plain-language metric descriptions.
- Crash-recovery screen and privacy/calculation disclosure.

## Implemented analytics

- Gross sales, net product revenue, sold/returned/net-delivered quantity, and return rate.
- Net Easy Ship fee, marketplace charges, reimbursements, advertising spend, TACOS, and ROAS.
- Net COGS, profit before/after ads, margin, ROI, ASP, profit per delivered unit, and break-even TACOS.
- Profit bridge from sales through refunds, charges, ads, reimbursements, tax, other adjustments, and COGS.
- Daily sales trend and product summaries.
- Full product-profitability screen with search, status filters, rankings, sorting, export, and cost coverage.
- Return analysis with RTO/customer split, trend, financial impact, reliability labels, SKU ranking, geography, drilldown, and export.
- Advertising workspace with trends, direct versus unassigned attribution, SKU drilldown, and operational filters.
- SKU geography by state and city for sales, profit, returns, RTO/customer returns, and charges.
- SKU/order time analysis by date, weekday, hour, and relative week.
- Product concentration, top/low performers, fee anomaly audit, data-quality center, and report comparison.

## Data protection and backup

- Reports remain in the current browser's IndexedDB.
- Costs and classification rules remain in local storage.
- Data & Settings provides a versioned JSON backup and restore workflow.
- Restore replaces current browser reports, costs, and rules after validation.
- Existing backup identity remains internally compatible with early `SellerFlow` backup bundles.
- Never commit seller reports, cost exports, browser backups, credentials, order IDs, addresses, or customer information.
- `reprot/`, build output, Playwright artifacts, dependencies, and TypeScript build metadata are ignored by Git.

## Quality and deployment state

Working-tree verification on 15 October 2026 (ADR-045; not yet deployed):

- Typecheck and production build pass.
- 25 Vitest files / 91 tests pass, including embedded-fee and later-refund profit regressions.
- All 10 Playwright desktop/mobile journeys pass, including sale-period pending totals, later evidence, unmatched review, and mobile overflow checks.
- A private local report review confirmed that August/September sale-period orders are retained, deferred amounts are separated, and complete-import reconciliation remains unchanged at zero difference. Private financial values and source records are not included in repository artifacts.
- `report/` is ignored alongside the legacy `reprot/` path. Regression fixtures are synthetic.

Historical production verification at `v1.0.2`:

- TypeScript build passes.
- 24 Vitest files and 77 tests pass.
- Eight Playwright desktop/mobile journeys pass in GitHub Actions.
- Production Vite build passes.
- Production dependency audit reported zero vulnerabilities at release preparation.
- GitHub Pages returns HTTP 200.
- CI runs on pushes and pull requests.
- Pages deploys automatically on pushes to `main`.

Important test invariants include money preservation, unknown-event retention, settlement exclusion, return COGS reversal, missing-cost policy, RTO evidence, effective-dated costs, report comparison, cost persistence, mobile drilldowns, and export behavior.

## Version-control workflow

- Production branch: `main`.
- Remote: `origin` → `https://github.com/azulia-hub/azulia-seller-flow.git`.
- Git author configured locally as `Azulia Hub <azulia5253@gmail.com>`.
- Use feature branches for substantial work and fix branches for financial defects.
- Merge through pull requests when multiple contributors are involved.
- Use semantic versions: patch for fixes, minor for backward-compatible features, major for breaking changes.
- Never rewrite published release tags.

Routine validation:

```bash
npm run typecheck
npm test -- --run
npm run build
npm run test:e2e
```

Routine publish flow:

```bash
git status
git add <specific-files>
git commit -m "type: concise description"
git push origin main
```

After pushing, confirm both the `CI` and `Deploy GitHub Pages` workflows are green before creating a release tag.

## Known limitations

- The app does not yet ingest Amazon Ads console campaign/search-term reports. Unified Transaction advertising charges provide total spend but usually not campaign-level or defensible SKU-level attribution.
- Generic CSV mapping exists, but first-class Flipkart and Meesho adapters are not implemented.
- The no-code metric builder is currently a UI foundation; the complete aggregate/formula registry, dependency graph, and circular-validation experience remain unfinished.
- Saved filter views, merged multi-source datasets, forecasting, scenario planning, and a configurable dashboard builder remain future work.
- Local browser storage can be cleared by the user/browser, so users must download backups.
- Profit remains an analytical estimate when costs are missing or source events are unclassified.
- GitHub Actions currently emits a non-blocking warning that some official actions target a deprecated Node runtime; workflows still run successfully under the runner's newer runtime.

## Current priorities

1. Add a proper generic filter/group/aggregate engine and connect the metric builder to typed expression trees with dependency and circular-reference validation.
2. Add daily/weekly/monthly percentage-comparison views consistently across product, return, advertising, and geography analysis.
3. Add saved views for common report/filter combinations.
4. Add direct Amazon Ads report ingestion when campaign optimization is resumed: campaign, advertised product, search term, placement, and purchased-product reports, preferably daily time unit.
5. Add first-class adapters for additional marketplaces without changing generic core calculations.
6. Add rule-based insights for high returns, negative profit, high TACOS, margin deterioration, and geographic concentration.
7. Add forecasting and scenario tools only after the generic analytics and metric foundations are complete.

## Checklist before changing financial logic

- Identify whether the rule is generic or marketplace-specific.
- Keep marketplace-specific behavior in an adapter/configuration.
- Preserve every source monetary value and raw label.
- Exclude settlement transfers from operating profit.
- Keep missing-cost status explicit.
- Add or update core tests for the changed invariant.
- Run typecheck, all unit/integration tests, production build, and relevant browser tests.
- Update `DECISIONS.md`, `ROADMAP.md`, and this handoff when behavior or architecture changes.

## Current branch follow-up — joined SKU advertising economics (21 October 2026)

On `feature/sponsored-products-asin-integration`, see ADR-046. The Sponsored Products report enriches both normal SKU drilldowns and Advertising drilldowns. Report spend is preserved; automatic GST/scaling/organic subtraction is removed. Advertising uses posting dates. Reported total attribution (same-SKU plus disclosed cross-sell) powers ACOS and ROAS. Profit restores booked SKU ads then deducts report spend once; missing costs block definitive profit. Actual GST needs an evidence reference and explicit optional allocation. Evidence is session-only, scoped to both imports and date range. Remaining account charges, unmatched SKUs, unassigned tax and signed differences remain visible. Reports offers “View product advertising” to choose intersecting report dates.

Verification commands and the independent Python source controls are documented in README. Private source data and generated controls must not be committed. This branch still predates main's October sale-period fix; no automatic merge/deployment was performed. Advertising report persistence is separate from existing backup bundles.

The new browser profit check also uncovered signed negative Amazon refund units increasing COGS. ADR-047 normalizes refund units in the Amazon adapter, retaining raw signs and all money. Reimport older affected signed-quantity reports to apply this fix; no stored datasets are silently rewritten.

Local validation for this follow-up: production typecheck/build pass; 97 Vitest tests across 28 files pass when private controls are enabled (96 pass + one opt-in skip normally). Independent controls cover 6,277 advertising rows and 101 advertised SKUs for August; every raw-SKU aggregate, joined product spend and complete-import financial reconciliation passes. Eight existing browser journeys pass, and both added desktop/mobile advertising journeys pass after fixes, including displayed ACOS/profit, explicit GST, missing costs, date-scoped tax, export, responsive layout and existing SKU navigation. Private values/records are absent from tracked artifacts. No commit, merge or deployment was performed. Pre-existing package/lockfile changes were left untouched.

Advertising visibility correction (ADR-048): financial Entire report coverage extending beyond an ads upload no longer leaves the main product table in a misleading financial-only fallback. Entering Advertising from the default period chooses shared dates, shown explicitly. Custom ranges are preserved with a one-click coverage/filter recovery action. The table defaults to advertised matched SKUs, with an All financial products selector and distinct evidence/status labels. Independent local identity checking found 85 matches and 16 unmatched advertised SKUs in the private files; unmatched rows remain reviewable.

The visibility regression also exposed an expanded custom-date filter card covering product rows on small screens. Expanded mobile filters now scroll normally; SKU links have space for the fixed header/bottom navigation. Unknown and fee-only financial SKUs remain available in the all-financial-products scope without inventing sales or advertising attribution.

ADR-048 validation: 99 standard unit/integration tests pass, the opt-in independent private-report check passes separately, production typecheck/build pass, both expanded desktop/mobile advertising journeys pass, and all eight existing browser journeys pass. The advertising regression reproduces August ads against a financial report extending to October, verifies actual matched rows, all-products status, explicit custom-date recovery and mobile taps.

## Current instruction — two-report contribution (ADR-049)

The seller rejected advertising GST allocation and deferred SKU Economics ingestion. Current inputs remain Unified Transactions and Sponsored Products. Manual GST state, editor, allocation and tax-inclusive product-profit outputs are removed. The shared SKU panel displays “Product contribution after reported ads”: Unified SKU operating result + booked SKU ads restored - net historical COGS - actual reported pre-tax Sponsored Products spend. Advertising GST, unassigned account expenses and advertising outside the report are excluded. Other source taxes, charges and entered costs retain their existing treatment; this is not fully GST-exclusive/final net profit. Missing costs block contribution. Business booked profit remains unchanged and never deducts Sponsored Products spend again. Evidence exports record these boundaries. Older handoff descriptions of actual-GST entry/allocation are superseded.

ADR-049 validation: all 99 unit/integration tests pass with the opt-in independent private-report verification enabled; production typecheck/build pass; all 10 desktop/mobile browser journeys pass. The advertising journeys now verify booked account spend of 59 versus unscaled reported product spend of 100, missing-cost blocking, contribution of -100 after costs, no GST allocation controls/placeholders, explicit CSV exclusions, and unchanged business booked profit of 166. These amounts are synthetic fixture values. No new dependency, commit, merge or deployment was introduced by this follow-up.

## Integrated navigation — ADR-050

The seller clarified that advertising should live in the original Dashboard → product/SKU → order flow. Primary navigation is again Dashboard, Reports, Data & Settings. Dashboard has Business overview and Advertising views. `SkuWorkspace` is the single shared tabbed SKU body for both metric drilldowns and advertising selections, composing existing commercial, advertising, geography and order investigation components. Financial entry opens Overview; advertising entry opens Advertising. Linked Orders keeps the original full inline audit and its state when changing tabs. Order evidence remains Unified-based, without distributing SKU ad spend to individual orders. No financial formulas or SKU Economics ingestion changed in this navigation follow-up.

ADR-050 validation: production typecheck/build and diff checks pass; 98 standard unit/integration tests pass (the private opt-in check is skipped without paths). All 10 existing/expanded browser journeys were verified across the full run and focused reruns. The mobile order overflow introduced by nesting the common workspace was fixed by making responsive order-table rules apply through the tab panels. Final mobile checks prove all four product tabs fit the viewport, linked order details remain within bounds, and Dashboard → SKU Advertising → linked order evidence retains the selected product and contribution values. Overview uses that product's own financial-context booked ads rather than mixing a posting-period ad summary into another financial basis.

## Seller workflow redesign — ADR-051 (supersedes ADR-050 UI)

Removed dashboard report tabs and the SKU report-tab body. Dashboard now embeds `DashboardAdvertising` and searchable `ProductPerformanceList` alongside business results. All product selections use the continuous `SkuWorkspace`: sales/returns, directly visible advertising and contribution, expandable financial detail, source orders, optional geography. Orders have eight essential columns on desktop, three on mobile, and retain complete inline financial audits. Advanced filters and timing charts are collapsed. Technical cohort evidence remains accessible through a disclosure. No new dependency or change to ADR-049 financial formulas.

Validation: 100 standard tests pass; the private opt-in verification is skipped without source paths. Production build passes. Existing eight non-advertising browser journeys passed; the updated desktop/mobile joined-product journeys passed, with a focused rerun also confirming mobile inline order bounds after the shortened table. Screenshots in ignored test-results cover desktop/mobile dashboard and mobile product advertising.

## Presentation refinement — 23 October 2026

Light is the default appearance, with persistent Dark and System options; System responds to OS changes. `src/styles/refinement.css` contains shared neutral presentation tokens and responsive overrides. Dashboard now leads with headline profit and three supporting metrics, followed by the existing data-quality actions and product list before advertising. Secondary metrics and the profit bridge remain accessible in disclosures. Mobile products show name, sales and contribution without horizontal scrolling; product profiles retain advertising evidence. Missing-cost estimates appear beside headline profit. No financial formulas changed.

Presentation validation: production build and diff checks pass; 101 unit/integration tests pass with one private opt-in skip; all 11 browser journeys pass, including desktop/mobile product investigation and persistent/system appearance. Light desktop/mobile and dark desktop screenshots were inspected. Changes remain local and uncommitted.

## Advertising date recovery — 23 October 2026

`AdvertisingRecovery` shares a consistent availability explanation between dashboard and SKU profiles. Recovery names the actual shared dates, discloses the switch to posted activity/all account and fulfilment types, and offers Undo restoring the complete previous selection. Explicit selections change only on user action. Non-overlapping reports show financial/advertising coverage and link to upload. Null advertising ratios show specific denominator explanations; missing product costs block contribution with a separate reason. Build, 101 unit/integration tests (one private opt-in skip) and all 11 desktop/mobile browser journeys pass, including new recovery/Undo/zero-activity/no-overlap assertions. No financial formulas changed.

## Seller clarity and context corrections — 23 October 2026 (ADR-052)

Business profit and Product contribution now have distinct labels and visible accounting boundaries. Ad ROAS is reserved for reported ad-attributed sales/spend; booked financial sales ratios are labelled explicitly, including audit exports. Total product sales, sales credited to ads and ad-attributed orders are named consistently. Reconciliation wording describes full-import financial matching rather than overall accuracy; report import success no longer claims universal SKU matches, and matched/unmatched counts identify the selected period. Canonical return codes are translated only in presentation.

With available advertising, the product comparison uses posting-date financial results throughout and direct product entry preserves that basis, including products omitted from the sales-period cohort. Financial metric investigations retain their selected basis and show it in the product profile. Missing posting activity cannot fall back to cohort amounts for advertising contribution. Core selector regression verifies different cohort/posting sales, cost coverage and contribution.

Filters default closed with dates and basis visible. Clear all restores the complete report, all dimensions and default sales-period basis and clears the date-change Undo. Duplicate dashboard product chart and Settings introduction cards are removed; cost entry comes first in Settings. Broader metric portfolio analysis remains under More analysis after the focused ranking. Backup explains included financial reports/costs/rules, excluded advertising/preferences, and that restore leaves the separately saved advertising report unchanged. Full backup integration remains future work.

Validation: production build, 102 standard tests (one private opt-in skip), diff checks, and all 12 desktop/mobile browser journeys pass. Browser coverage includes the mixed financial/posting selection, product entry context, full filter reset, collapsed defaults, optional analysis and backup scope. Financial formulas and canonical normalization are unchanged; no dependency was added. Changes remain local/uncommitted.

Final presentation check: removed the mobile full-sheet fade that allowed underlying dashboard text to show through during entry. The four affected mobile/filter browser checks pass on the final stylesheet; production build and diff checks also pass. Audit workbook labels now match the business-profit and booked-expense terminology.

## Report search and live inline product costs — 23 October 2026 (ADR-053)

A report-wide search appears whenever an active financial report is loaded. It finds product descriptions, SKUs, conservatively matched advertising identities/ASINs, order IDs, cities/states and account source labels. It explicitly searches all active-report dates, including unknown and undated evidence. Match counts disclose bounded results. Order/location/account selections open an accessible native evidence dialog without changing global filters. Product selection explicitly switches to all report dates/posting-date view, then uses the standard product workspace.

All product workspaces now contain a shared Product cost editor. Missing costs open it automatically; existing saved costs use a compact editable disclosure. Valid typing previews net product cost, profit and applicable reported-ad contribution immediately through the existing pure selectors. The same draft collection feeds financial, product, order, return, comparison and data-quality results. Save persists through the existing cost store; Cancel and leaving the product discard unsaved changes. Optional effective dates preserve other dated records; an undated record remains a fallback. Single-product order search detail also exposes cost entry and live order figures. Invalid/blank costs never silently become zero; zero requires explicit entry. Cost entry does not fabricate missing ads, source classifications or sales evidence.

New pure modules: `core/search/reportSearch.ts` and `core/costs/setProductCost.ts`. UI: `ReportSearch.tsx`, `ProductCostEditor.tsx`; orchestration owns preview and persistence. No dependency was added and normalization/financial formulas remain unchanged.

Validation: production build and diff checks pass; 109 standard unit/integration tests pass with one private opt-in skip. All 14 desktop/mobile browser journeys pass, including new search/source-evidence, live order/contribution, cancellation, dated-cost and persistence checks. Final focused search/cost journeys cover desktop and mobile refinements. Ignored screenshots `inline-cost-375.png` and `inline-cost-1280.png` document the editor. Changes remain local/uncommitted.

Title search follow-up: Search by now offers All fields and Product title. Generic title/name column recognition handles spaces, underscores and hyphens, prefers explicit product titles for result labels, and retains sale descriptions as searchable title fallback. Title-only mode returns products and does not treat SKU/order IDs as titles. Raw evidence and monetary calculations are unchanged. Production build and 110 standard tests pass (one private opt-in skip); focused desktop/mobile search journeys exercise title-only selection and empty states.

## Seller workspace rebuild and performance fixes — ADR-054

The seller requested a coherent UI comparable to My Real Profit, SellerScout and sellerboard, plus fixes for sluggish/buggy interactions. Public reference pages were inspected visually. Current navigation is Dashboard, Products, Advertising, Returns, Product costs, Reports and Settings, with desktop sidebar/header search and mobile drawer/bottom destinations. Dashboard now has four comparable primary KPIs, compact report checks, a sales trend beside a financial breakdown, and a bounded searchable product table. Products has title/SKU search, status/sort controls and 25-row pages; Dashboard shows eight products. Financial mode shows profit before unassigned ads rather than filling every row with unavailable advertising contribution. Product costs is a separate workflow; Settings contains calculation preferences and backup.

Reproduced performance defects: product opening first built a complete metric investigation; product analysis rescanned the entire event collection per SKU; each cost application repeatedly scanned the cost master; report comparisons/quality checks ran in unrelated workflows; hidden heavy disclosures and unbounded tables still mounted. Fixes include one-pass event grouping, invocation-local indexed effective-date cost resolvers shared by orders/SKUs/returns/bulk edits, incremental cost-affected SKU previews, deferred pending preview state, workflow-specific diagnostics, lazy disclosures, and bounded product/order/cost/bulk-selection rendering. Core remains pure TypeScript, with no mutable global analytics cache or new dependency. `businessOverview.ts` now owns the composed financial formulas formerly assembled in App.

Products open directly in `ProductDetailDialog`, with native focus/Escape behavior and an accurate return destination. Global-search product profiles use full-report context while preserving dashboard filters (superseding ADR-053's date switch). Source evidence and existing financial/advertising boundaries are preserved. Refresh restores the last report, selected dates, fulfilment filter and calculation view. A visible follow-up coverage notice explains exclusions and offers posted transactions instead of leaving an apparently empty dashboard. One-point charts are visible, mobile financial result columns are retained, negative zero formatting is cleaned up, and bulk-edit approval is invalidated when its inputs change.

Financial correction: daily SKU refund trends use the original sale's cost date from full SKU analysis instead of incorrectly selecting a newer refund-date cost. Regression covers the sale/return daily bridge and zero net COGS. Canonical financial money and booked/reported advertising rules are unchanged.

Validation on the final implementation:
- Production build and diff checks pass.
- 115 standard unit/integration tests pass, with one opt-in private-source test skipped.
- All 15 desktop/mobile browser journeys pass, including dark mode, bulk-consent reset, searchable bounded cost history, direct product and source search, live cost preview, source-period recovery and refresh restoration.
- Synthetic selector benchmark: 12,000 orders / 26,400 events / 150 SKUs; product analysis about 2.88 s before and 0.63–0.74 s after (local single-run measurements, load dependent). Both versions report COGS 1,680,000 and product profit 6,720,000, with 150 products and 12,151 search documents.
- Browser large-report check: 3,000 orders / 6,000 events / 100 products; final product opening 281 ms, cost preview 490 ms; no JavaScript page errors. These measurements do not guarantee arbitrary dataset-scale performance.
- `npm run benchmark:analytics -- 12000` reproduces the synthetic selector benchmark without private data.

Ignored review artifacts: `test-results/workspace-large-desktop.png`, `workspace-large-mobile.png`, `workspace-large-dark.png`. No commit, merge or deployment was performed; earlier unrelated working changes remain in place. The previously documented newer-main sale-period merge and advertising-backup integration remain separate follow-ups.

## Product page refinement — ADR-055

Products now open inside the workspace as dedicated pages rather than native detail dialogs. Identity and compact unit-cost Add/Edit precede performance cards and trend; advertising and source orders follow. The list remains mounted so search, status, sort and pagination persist. Hash history provides Back/Forward, with restored list scroll and product focus. Source-evidence dialogs are unchanged.

The quick cost editor starts closed even for missing costs, offers one small input and Save/Cancel, and previews through the existing shared cost draft. No effective-date field or large preview/history panel appears here. Saving changes only the default fallback and preserves dated records; advanced maintenance stays in Product costs. Leaving cancels unsaved drafts. This supersedes the inline-cost and product-dialog interaction described in earlier handoff entries.

Validation: production build, 115 unit tests passing (one private fixture skipped), and all 15 browser journeys passing. Desktop/mobile screenshots: test-results/product-page-1280.png, product-page-375.png, product-page-edit-1280.png and product-page-edit-375.png. Large-report product-open and live-preview checks remain below the 4-second regression threshold.

## Azulia identity and product advertising coverage — ADR-056

Supplied artwork remains unchanged in logo/. Background-free output and optimized app assets are in public/brand/; README there records the image edit prompt/provenance. Navigation, mobile header, welcome screen, recovery screen and browser icons use the logo. Light/dark workspace palettes now match its gold/charcoal identity with separate profit/loss colors.

Root cause of recurring product advertising date notice: search always opened a REPORT-scoped product, whose attribution ignored selected dates; shared-date action closed the product instead of updating its scope. Applying shared dates now retains the SKU in POSTED scope. Product search uses selected dates when the period is explicit; All dates retains REPORT scope. Product header/search action labels identify scope. Posted product summaries are also built in Products when headline financial basis differs from posting basis. Product recovery upload actions now navigate to Reports correctly.

Browser regressions cover desktop/mobile full-report search → shared-date recovery → same product with ACOS, then manually matched dates → product search with no recurring coverage notice. Financial calculations and coverage checks remain unchanged.

ADR-056 validation: build passed; 115 unit tests passed, one private fixture skipped; all 15 browser tests passed including the added 1280px/375px date-recovery regression. Visually checked product screenshots at both sizes and the dark dashboard.

## Theme regressions and dropdown reduction — ADR-057

Fixed screenshots showing legacy dark Returns KPI gradients and unreadable source-order hover backgrounds in light mode. Return snapshots now share neutral themed cards and readable labels; order hover/selection uses theme selection colors. Rules/donut surfaces also follow the theme.

New shared ChoiceGroup exposes native radios for search mode, product status, calculation view, return type and short order filters. Long/dynamic selectors and advanced/heavy investigation disclosures remain. Group names are unique, selected state is visible, focus remains explicit, and options wrap on mobile. Existing filter behavior and financial calculations are unchanged. Browser tests now use the visible choices and add light/dark desktop/mobile contrast/hover checks.

ADR-057 validation: production build and whitespace check passed; the existing 15 browser journeys passed with visible-radio controls. Both additional desktop/mobile theme regressions passed after selecting posted activity in their fixtures and waiting for hover transitions. All tested Return card text exceeds 4.5:1 contrast in light and dark themes. Screenshots: test-results/returns-{light,dark}-{1280,375}.png and order-hover-{light,dark}-{1280,375}.png.

## Metric investigation styling follow-up

Metric trend/comparison/analysis panels, ranking controls, close/back actions and hover states now use Azulia theme tokens. The trend stroke overrides the legacy blue stylesheet rule. Ranking direction uses visible Highest/Lowest radio choices. The overlay owns scrolling (background body locked while mounted), the ranking grid can shrink, and the bounded SKU table keeps its column headers visible while scrolling. Comparison guidance directs users back to Dashboard filters. Responsive summary/chart/control layouts remain available.

User explicitly requested no tests: no test, build or browser automation was run for this follow-up.

## Explicit search modes — ADR-058

Added All, SKU, ASIN, Title, City, Order and Location choices above the query so the input keeps its width on mobile. Pure search matching now isolates each field/result kind. SKU/source aliases and configured identity aliases are indexed separately; ambiguous aliases stay excluded. City is city-only; Location includes city/state; Order is identifier-only. Mode-specific placeholders/empty states explain available evidence. Source evidence and product date-scope behavior remain unchanged.

Added unit regression cases for scoped fields and conservative alias separation; updated the existing browser Title label. No tests, build or browser automation run, as explicitly requested.

## Product clarity and logo entrance — ADR-059

Renamed seller-facing Product contribution to Profit after ads across product cards/table/advertising UI while retaining its existing reported-spend calculation and visible exclusions. Core identifiers and accounting formulas remain unchanged.

Product accordions became titled ContentSection blocks that mount near the viewport. Jump links lead to advertising, costs/returns, orders and locations. Advertising extra metrics/calculation/campaign/daily tables are visible sections; source orders precede timing patterns. Filters are open; short dimensions use radios, larger lists accept an exact source name, constant dimensions are omitted. Timing metric uses radios. Individual source-order evidence still expands in place.

BrandEntrance uses the existing transparent logo and native Web Animations API: center appearance, a move to the responsive brand position, then workspace reveal. Once per tab via sessionStorage. Reduced motion, resize, asset failure and timeout reveal safely; report loading is independent. Updated existing browser label/disclosure interactions without executing them. No tests, build or browser automation run, per user instruction.

## Where to focus — ADR-060

Implemented Dashboard priority cards and five visible analysis modes after primary KPIs. New pure focus selectors calculate sorted positive amounts, cumulative shares, real counts reaching 80% and actual top-fifth concentration. Sales use selected financial product sales; losses exclude profitable/missing-cost products and are before unassigned ads/shared expenses. Return losses aggregate existing after-reimbursement/recovery order results, excluding incomplete groups and preserving an exclusion warning. Overlap with product losses is explicit.

Ads use reported product spend with attributed sales and existing supported profit-after-ads values. Unmatched spend stays visible without invented product links. Campaigns group selected-period source rows by portfolio/name; Review exposes constituent source products/spend/attributed sales. No verified campaign loss/profit or growth promise is inferred. Unsupported advertising shows existing coverage recovery. New rows are bounded, mobile labels stay visible, and focus selection lives in App to survive product review.

Added unexecuted unit cases for actual concentration, zero/nonfinite input, separate loss sums, missing costs, unmatched ad evidence, date-scoped campaigns and unsupported coverage. No tests, build, benchmark or browser automation run, as instructed.

Ads focus also shows verified product losses after reported ads separately from unknown profit evidence; this is not an allocated campaign loss. Added an unexecuted regression case for this guard.

## Advertising review candidates — ADR-061

User rejected large-budget ranking as a signal of poor ads. Ads/Campaigns focus now compares full-group spend share against ad-attributed sales share, with explicit zero-sale/spend-exceeds-sales criteria and known negative product profit after ads. Candidates alone are ranked by spend; 80%/running totals refer to flagged spend. Table shows full-group Spend share, Sales share, ROAS and Why review. Strong spenders with proportionate sales and no supported loss disappear from the attention list. This is relative inefficiency, not verified waste or recoverable savings.

Unmatched source products use their raw selected-period attributed sales; missing sales exclude comparison instead of assuming zero. Campaign profitability remains unclaimed. Updated unexecuted regressions for proportional large budgets, weak output, zero sales, unavailable evidence, known losses and date-scoped campaign evidence. No tests, builds or browser automation run.

## Installable audited release — ADR-062

Added native/fallback Install Azulia actions in the sidebar and Settings. Production manifest/icons use the supplied logo, including maskable and iPhone variants. Local build plugin generates a content-versioned scoped service worker, precaching hashed lazy chunks and small brand assets. Offline reopening restores reports from existing local storage. Updates wait for explicit reload; local reports/costs are not cleared. Dev mode avoids service-worker caches. Fresh users follow OS appearance; explicit saved themes persist.

Integrated main c54c474 without reverting the workspace: sale-period totals include recent sales, linked released evidence and separate pending activity. Restored pending/unmatched review and per-order activity in inline audit, carried source cohort into exports and migrated the legacy saved-basis identifier. Financial regression tests cover original-sale COGS reversal and released/deferred duplication.

Optimized repeated advertising scans/array copies and bulk SKU joins. Shared cohort cost resolvers and deferred per-order details reduce unnecessary Dashboard work. Split Cost/Returns/Reports/Settings into lazy chunks. Removed three unrouted legacy screens and old cost-panel CSS/unused imports. Added Node development types for the build plugin and patched Vite to 6.4.5; dependency audit returned zero vulnerabilities.

Production browser tests verify manifest/icon dimensions, native prompt integration, offline report/product reopening on desktop/mobile under /azulia-seller-flow/, and update activation without data loss. A test-runner artifact collision found during parallel verification is fixed by distinct output directories. Expanded app journeys cover weak-ad/campaign selection, field-specific search and initial system/reduced-motion behavior.

Release validation (2026-10-24): production build/type checks pass with unused-symbol checks enabled. Unit suite: 138 passing, one opt-in private fixture skipped. Current app suite: all 20 journeys passed; restored main sales-period/pending-evidence journeys also pass at 1280px and 375px. Targeted large-report check after the final scope optimization: product open 317 ms, live cost preview 640 ms for 3,000 orders/6,000 events. Synthetic 12,000-order/26,400-event benchmark measured 612 ms for product summaries and 247 ms for search indexing on this host. These are bounded synthetic measurements, not arbitrary-scale guarantees. Initial JS bundle reduced from approximately 502 KB to 445 KB (147 KB → 133 KB gzip).

Production PWA checks include a real persistent Chromium profile (not private browsing), manifest/icon/platform metadata, native install-event integration, nested-host offline report/product restoration at both sizes, and explicit update/reload preserving saved reports. Icon backgrounds are opaque warm ivory, while ordinary workspace logos retain transparency; the maskable logo fits inside the circular safe zone. A native-radio hit-target bug discovered by browser checks is fixed with full-label inputs and scroll spacing, and fixed navigation now scrolls at short viewport heights.

Final release-build PWA verification: all 6 checks passed, including normal-profile Chromium installability. Combined browser coverage is 22 app journeys plus 6 production PWA checks. Dependency audit: zero known vulnerabilities.
