# Azulia Seller Flow — MVP

For the consolidated product status, completed work, formulas, deployment state, and continuation instructions, see [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md).

A local-first, responsive React + TypeScript analytics workbench inspired by the generic AWK pipeline philosophy:

`source -> normalize -> enrich -> filter -> aggregate -> calculate -> visualize -> insight`

## Run

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

Browser-level regression tests:

```bash
npx playwright install chromium
npm run test:e2e
```

## Current MVP

- Responsive polished dashboard shell
- CSV import in browser
- Data-quality/reconciliation surface
- No-code metric builder UI
- Cost master / missing-cost assistant
- KPI dashboard
- Product table and visual analytics
- Mobile responsive navigation
- Local-first privacy UX
- Core CSV + metric logic separated from React UI
- Versioned local backup and restore for reports, costs, and classification rules
- Audit workbook export and explicit financial reconciliation
- Optional Sponsored Products XLSX enrichment for ASIN-linked advertising analysis; Unified Transactions remains the financial source of truth

## Deployment

Push `main` to run verification and deploy `dist/` through GitHub Pages. In the repository settings, set **Pages → Source** to **GitHub Actions**. The Vite build uses relative asset paths so it works from a repository subpath.

Do not commit seller reports or exported backups. `reprot/` is ignored because marketplace files can contain order and location information. See [PRIVACY.md](PRIVACY.md).

## Architecture rule

`src/core` must remain pure TypeScript and should not import React or visualization libraries.

Future adapters (Amazon, Flipkart, generic CSV), DuckDB-Wasm, IndexedDB, charts, forecasting and saved dashboards plug into this core through interfaces rather than business logic being embedded in components.

### Verify SKU advertising calculations

Open **Reports → View product advertising**, then click a SKU. The app chooses the intersection of financial/ads report dates. **Export advertising evidence** downloads metrics, contribution components, campaign/day spend, dates and exclusions. Compare spend and attributed sales by filtering the original ads workbook to the same dates and advertised SKU; sum all campaign/ad-group rows. ACOS uses total attributed sales, including disclosed cross-sell. Product contribution uses posted financial activity and historical product costs. Advertising GST and unassigned account expenses are excluded, and other source tax/charge treatment is unchanged. Missing costs block contribution; GST does not require manual entry. Overall booked business profit uses Unified expense.

Run synthetic checks and desktop/mobile journeys:

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

For an independent check against private source files, Python's standard library reads XLSX XML and uses decimal arithmetic, independently of the app parser/calculations. Keep control output outside the repository:

```bash
python3 scripts/verify-advertising.py \
  --ads /path/to/advertised-products.xlsx \
  --unified /path/to/unified.csv \
  --from-date 2026-08-01 --to-date 2026-08-31 \
  --output /tmp/ads-controls.json

AZULIA_ADS_FILE=/path/to/advertised-products.xlsx \
AZULIA_UNIFIED_FILE=/path/to/unified.csv \
AZULIA_ADS_CONTROLS=/tmp/ads-controls.json \
npm test -- tests/integration/privateReportVerification.test.ts
```

The opt-in test compares every advertised SKU's spend, sales, impressions, clicks, orders and units; overall control totals; joined matched + unmatched spend; and full-source money reconciliation. It skips when paths are absent. It does not prove missing source records, attribution causality or tax recoverability. Synthetic financial tests independently verify contribution exclusions, COGS reversal, charges, missing costs, settlement exclusion and avoiding duplicate ads deductions. Private reports, generated controls and real financial values must never be committed.

Advertising opens on shared report dates when the financial period is still the default Entire report. The product table initially shows products matched to the uploaded ads report. Use **Products shown → All financial products** to include SKUs without ads rows. Explicit custom dates remain selected; **Use ads report dates and clear dimension filters** restores a compatible advertising view. Unmatched advertised SKUs remain in the review above the table.

Advertising is integrated into the original navigation: **Dashboard → Advertising**, or open a SKU from any dashboard metric and select its **Advertising** tab. The same SKU workspace has **Overview, Advertising, Geography and Orders** tabs. **Inspect linked orders** opens the existing order evidence for that SKU. Product advertising is not allocated to individual order profit without source attribution.

The dashboard now includes overall advertising results and a searchable product table. Open a product to see sales, returns, ad spend, ACOS, contribution and source orders together. Campaign and calculation evidence is available in expandable sections. If uploaded report dates differ, use the shared-dates action to align posted activity.

### Search and product-cost entry

Use **Search your report** to find product names, SKUs, supplied advertising ASINs, order IDs, cities/states or account transaction labels. Search covers all dates in the active financial report. Order and location results show source evidence without changing dashboard filters. Product results respect explicitly selected dates; selecting All dates opens the full report. Search actions disclose which period will open.

Open a product to see its dedicated performance page. **Back** returns to the previous list with its search, filters, page and scroll position intact. Beside the product name, **Unit cost → Add/Edit** opens a compact input. Valid edits preview cost-dependent figures live; **Save** retains the default cost and **Cancel** restores saved values. Leaving the product discards unsaved edits. Existing dated costs are preserved; manage dates and history in **Product costs**. Missing advertising/source evidence remains unavailable.

Choose **Search by → Product title** to restrict results to product titles. Title, Product Title, Item Title, Product Name and Item Name columns are recognized from preserved report fields; sale descriptions provide a fallback. Partial words work without case sensitivity.

### Seller workspace and performance checks

The current workspace has Dashboard, Products, Advertising, Returns, Product costs, Reports and Settings destinations. Search is in the header. Product details open directly; global-search product profiles respect explicitly selected dates without changing dashboard filters. The shared-dates action keeps the product open and aligns its advertising and financial scope. Your last report and date/calculation view restore on refresh. A coverage notice explains when sales-period exclusions affect results and offers a posting-date view.

Reproduce the synthetic selector benchmark with:

```bash
npm run benchmark:analytics -- 12000
```

This creates 12,000 synthetic orders / 26,400 canonical financial events / 150 SKUs and prints timings plus COGS/profit/product/search control totals. In this environment, initial product analysis measured about 2.88 seconds before indexing/grouping and 0.63–0.74 seconds afterward; control totals stayed identical. Timings depend on hardware and concurrent load. Browser regression separately exercises 3,000 orders / 6,000 events, pagination, direct product opening, live cost preview, refresh restoration and mobile navigation. No private report is required.

ADR-054 supersedes older descriptions that restricted navigation to three pages or changed dashboard dates when opening a global-search product. Backup scope remains unchanged: advertising reports and view preferences are stored separately from the versioned financial backup.

Azulia branding uses transparent artwork from `public/brand/` with warm ivory/gold light and charcoal/gold dark themes. Asset provenance and the background-removal prompt are recorded in `public/brand/README.md`.

The Dashboard's **Where to focus** section shows actual sales/loss/return/ad/campaign concentration, including the group reaching 80% and the share of the top fifth. Select a visible focus category to review ranked evidence. Losses exclude missing-cost products, return losses overlap product losses, and campaign spend is not labelled verified loss. Advertising requires covered posting dates. Ads and Campaigns focus flags weak sales output relative to spend, zero-sale spend and supported losses; large spend alone is not a problem. The 80% group covers flagged spend, while separately labelled spend/sales shares compare the complete known group. Unmatched products retain source sales evidence where available.

### Install Azulia

Open the deployed HTTPS site and choose **Install Azulia** in navigation or Settings. Supporting browsers open their installation prompt; other browsers show instructions. On iPhone/iPad use Safari → Share → Add to Home Screen. The installed icon uses the Azulia logo. Installation is per browser/device and does not sync reports.

After the production app has cached its files, saved reports can reopen offline. Save edits before choosing **Update and reload** when a new version is ready. Development mode deliberately does not register a service worker. New users follow the system theme, while saved Light/Dark overrides are retained.

Run `npm run build` then `npm run test:pwa` to check the production manifest, logo icons, nested-path offline operation and update behavior. Core checks remain `npm test`; UI journeys use `npm run test:e2e`. Production PWA and UI tests use separate artifact directories.

Sales-period reporting includes every order sold in the selected period regardless of its age; pending activity is separate from released results. Twenty days of follow-up is a completeness indicator, not a reason to exclude recent sales.
