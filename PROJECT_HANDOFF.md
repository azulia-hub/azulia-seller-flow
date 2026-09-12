# Azulia Seller Flow — Project Handoff

Last updated: 12 September 2026  
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

Current verified state at `v1.0.2`:

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

