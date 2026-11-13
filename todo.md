# Seller Analytics TODO

## Android launch crash, chrome and logo — fixed in v0.1.3 (2026-11-13)

Crash log confirms Java OutOfMemoryError while parsing saved workspace readings. Transfer readings as bounded raw chunks; compress new readings in the renderer, never materialize them as Java JSONObject graphs, and commit uploads atomically with version checks. Preserve legacy readings through chunked reads, source data and credentials. Remove native toolbar, use existing Azulia logo for launcher/startup, and show bundled UI promptly. Build/install same-key update and open/check the app on the connected Pixel, explicitly authorized by owner. Signed v0.1.3 built and installed over existing data. Opened on Pixel, confirmed dashboard loads and remains alive with no fresh crash; fresh-launch screenshot shows the Azulia logo, the second launch restored the dashboard with saved orders, the native toolbar is absent, and no fresh crash was logged for either checked process. No broad test suite or push.

## Android order titles/images — implemented in v0.1.2

Fix metadata starvation: enqueue newest/visible order-item and catalog enrichment during ongoing financial/date history, with bounded fair scheduling and existing cooldowns. Opening an order card prioritizes its displayed order IDs. Resolve open modal data from the latest scoreboard so metadata updates live. Preserve financial formulas, records, source money and credentials. Web/type checks and signed APK compilation passed for v0.1.2 (version code 3). ADB update installation on the Pixel succeeded, preserving app data and the existing signing key; no test suites, app launch or manual Amazon requests.

## Local first-reading save failure — code fixed; restart required

Cached-record diagnosis: normalization succeeds in ~4 seconds, but the current completed reading serializes to ~204 MiB, above the new 32 MiB HTTP save cap. Implemented lossless compressed desktop transfer/storage, bounded decompression, visible save errors and separate sync/calculation status. Existing-data diagnosis measured ~19.3 MiB gzip versus ~204 MiB JSON. Build/type checks passed; the currently running Node process needs restarting to load the updated endpoint. Preserve all raw records and calculations. Do not delete browser/source data or run tests/live API checks. Android v0.1.1 installation failure remains pending the exact Android error.

## Basic Android background fetch — implemented

Implemented the platform JobScheduler (no added dependency) to fetch bounded recent Orders/Finance pages while the interface is closed. Persist raw pages and pagination checkpoints in a private staging inbox; ingest them with the existing TypeScript parsers/page reducer when the app reopens. Keep calculations in the existing engine, preserve money tokens, stop scheduling after Forget credentials, and rebuild a higher-version signed APK. Android controls timing. Web build, signed APK compilation and signature verification passed for version 0.1.1 (version code 2), using the existing signing key. Output: .local/releases/azulia-seller-0.1.1.apk. No tests, device runs, live Amazon calls or push.

## Active — persistent desktop/mobile storage (ADR-076)

Stage 2 source implemented: trusted GitHub Pages WebView, native encrypted Amazon session, SQLite source transactions and image files; reuse the current sync/page reducers and financial parsers. Manual signed/debug APK build paths are included. JDK 17, Gradle 8.13 and Android SDK 36 are now installed privately under .local/android-tools/. Signed APK compilation/signature verification passed; installable output is .local/releases/azulia-seller-0.1.0.apk. No test execution, Amazon calls or push. Next: owner installs the APK on the phone; device checks remain unperformed. Signed update discovery/installation is the following implementation stage. See android/README.md.

Implement in ROADMAP.md order: existing desktop SQLite + local image files,
then Android native transport/storage/API access, then compatible website/APK
updates. Preserve current report calculations and all existing private data.
Pixel 8a is the first target; the APK must support Android 16/17 without requiring
a running computer. Do not reintroduce Netlify Database or Supabase. No push,
test suites, emulator/device or live API tests are authorized now. Full backup
and OS-managed closed-app syncing must not be claimed until implemented.

Stage 1 complete: desktop workspace SQLite, persistent automatic readings/costs/rules/policy, and private downloaded thumbnails. Existing source SQLite and calculations are retained. Typecheck and production build passed; tests were authored but not executed. Next: Android native bridge, phone storage and Amazon HTTPS; signed APK updates follow. No push or live API requests. See docs/DEVICE_STORAGE.md.

## Active — automatic delivery into the existing report workflow (2026-11-07)
Preserve all existing calculation engines/screens, imported history, costs, rules and PDF tools. Local backend remains running to sync with browser closed; computer shutdown stops work. No cloud database.
- [x] Add pure missing-history interval planning, stable source identity merging and deterministic sorting.
- [x] Add private account-scoped local source cache and durable pagination/coverage/checkpoints using built-in SQLite; no new package.
- [x] Retrieve financial activity through fixed India Finances API; bootstrap only missing history, refresh recent overlap and revisit unresolved order references. State that no universal updated-since endpoint exists.
- [x] Adapt cached API records to the existing Unified report columns/normalizer; preserve exact source money, unknown components, raw provenance and unallocated residuals. Do not invent missing location/shipping-method data.
- [x] Add a backend-owned periodic coordinator, bounded retries, identity isolation and safe local endpoints; keep syncing without a browser.
- [x] Show the last saved automatic dataset first, update it live through the existing app state, expose progress and permit older-date backfill. Keep manual files as separate fallback sources, never blindly combine ID-less CSV rows with API records.
- [x] Author targeted invariants and integration regressions. Tests, builds and live API checks remain deferred until owner asks.



Source implementation checkpoint: backend-owned polling, private SQLite records/checkpoints, missing-history planning, ID upserts, overlap/unresolved-order refresh, sorted delivery, stable normalized IDs and live existing-app ingestion are written. Manual uploads stay separate. No new analytics engine or dashboard rewrite. The API does not expose an exact Unified CSV or universal change cursor; absent fields/unknown components and change-discovery limits are visible. Tests/builds/browser/live checks were not run; no parity or performance validation is claimed.


Prioritized product backlog from the overview review.

- [x] User-friendly application foundation: organize Home, Products, Returns, Reports, and Data & Settings inside a reusable responsive shell with consistent filters, guided empty states, simpler terminology, and progressive metric disclosure.
- [x] Order-level profit drilldown: inspect sales, refunds, shipping charges and reversals, marketplace fees, advertising, reimbursements, tax, COGS, and final profit for each order.
- [x] Dedicated advertising analysis: TACOS, ROAS, daily trends, direct/unassigned spend visibility, and exportable SKU attribution.
- [x] Import history and dataset comparison: retain normalized uploads in IndexedDB, show date coverage, detect matching and report-only events, reopen saved reports, and compare matching periods with cost-aware profit metrics.
- [x] Unclassified-event manager: group unfamiliar raw transaction labels, show their financial impact and source evidence, assign a canonical category, save reusable source-specific rules locally, apply them immediately, and allow rule removal.
- [x] Return intelligence: distinguish Amazon RTO (Easy Ship handling-fee reversal present) from customer returns (no reversal), with return-loss/recovery metrics, daily and weekly trends, classification coverage, SKU search/filter/rankings, reliability labels, drilldown, and CSV exports.
- [x] Cost history: support effective-dated product costs so historical profit uses the cost applicable on the transaction date.
- [x] Product profitability screen: provide portfolio KPIs, profit/loss rankings, SKU search and status filters, sortable per-SKU sales/returns/fees/ads/COGS/profit metrics, CSV export, cost coverage, Cost Master access, and SKU-to-order drilldown while surfacing unassigned activity.
- [ ] Trends and comparisons: daily/weekly/monthly trends with previous-period and percentage comparisons.
- [x] Export and reconciliation: export filtered summaries and order-level calculations, with proof that normalized totals reconcile to source data.
- [ ] Saved views: retain useful filter combinations such as a month, state, SKU group, or missing-cost selection.
- [x] Backup and restore: export and restore saved reports, cost master, and classification rules with format validation.

Avoid adding decorative metrics that cannot be traced to source events. Every financial result should support drilldown and reconciliation.

## Owner-directed rollback — 2026-11-07

- [x] Restore the pre-API report/PDF frontend from commit `34f5eac`.
- [x] Remove later connected dashboards, models, workers, source downloads, Cloudflare implementation and related documentation/tests.
- [x] Preserve local hosting, credential setup, authorization check and optional permission probe.
- [x] Preserve private credential files, original source reports and existing browser data; remove stale built application output.
- [ ] Future rebuild scope is intentionally undecided. Do not restart the removed API architecture automatically.

No tests, builds, live checks, deployment, commit or push were performed during this rollback.

Automatic-delivery refinement: after the initial local baseline, browser updates also use changed-record deltas. Cached source records are merged before normalization; unchanged recent-overlap responses do not trigger a new data reading. Same-ID DEFERRED_RELEASED updates retain one released record; only explicit complete paired release links supersede another source record. Verification remains deferred.

Delivery correction: accept verified neutral currencyless-zero item placeholders under INR roots; preserve strict handling of nonzero/foreign money. Display a conversion error as Needs attention rather than Connecting. Cached-shape diagnosis was read-only; regression cases are authored but unexecuted.

## Delivery mapping correction — 2026-11-07

- [x] Read cached field paths and transaction kinds without printing seller identifiers or monetary values.
- [x] Map observed OurPricePrincipal/OurPriceTax, ItemTDS, TCS variants, shipping credits, promotions, billed fee base/tax, advertising and explicit reimbursement labels to existing report columns.
- [x] Keep generic MFN postage as a marketplace charge with unconfirmed shipping method; do not invent Easy Ship/RTO evidence. Preserve unknown types/labels and settlement separation.
- [x] Rebuild version-1 automatic readings from cached source records using mapping version 2 even if the source revision has not changed. No Amazon history re-download required.
- [x] Nest long source notes in a bounded panel; display source date coverage in India time.
- [x] Author source-alias and original-normalizer conservation regressions. Tests/builds remain deferred.

This corrects ingestion labels only. Existing analytics calculations, cost policies, manual CSV parsing and dashboards remain unchanged; no live financial total has been asserted validated.

## Purchase-date order cycles — 2026-11-07

- [x] Trace the original CSV cohort/pending/cost rules before changing the API bridge.
- [x] Add a generic explicit order purchase date; keep CSV first-sale-row inference only when that field is absent. Never substitute an API posting/release date for an unknown purchase date.
- [x] Select orders by purchase date, include all their cached later activity, and exclude other-period orders. Keep deferred and unknown API release states out of realized totals.
- [x] Cache verified Amazon order dates separately from raw financial records; publish affected source IDs as deltas and rebuild mapping-version-3 readings.
- [x] Discover orders in requested purchase windows, paginate/checkpoint independently, fetch their financial history by order ID and revisit known orders for later refunds/releases. Reuse existing history coverage.
- [x] Use purchase dates for cohort sales charts and dated product costs; keep financial posting dates for audit/reconciliation and account-level expenses.
- [x] Show missing-date/progress/access errors and retain missing-origin records for review.
- [ ] Execute regression/build/browser/live checks only when the owner requests testing. Author regression cases now; no financial parity claim until verified.

## CSV versus API reconciliation — 2026-11-07

Owner supplied `reprot/2026Feb1-2026Oct31CustomUnifiedTransaction.csv` and explicitly requests a real-data comparison using the existing application calculations.

- [x] Normalize the supplied CSV and a read-only API-cache snapshot with the production adapters and cohort engine.
- [x] Separate missing history/date metadata from true mapping or calculation differences; compare monthly totals and matched order evidence only within supported coverage.
- [x] Trace discrepancies by source type, amount category, release state and order origin. Preserve full private evidence under ignored `.local/`.
- [x] Fix confirmed causes without changing CSV financial formulas; repeat this focused comparison and relevant regression checks only.
- [x] Document verified results and any remaining source gaps. No unrelated broad/browser test suite is authorized by this comparison request.

Reconciliation continuation: the previously running backend still held the old reader and was restarted with the tested source. A second confirmed bug applied one malformed financial reference’s six-hour retry to the whole date queue. Permanent per-reference failures now retain review evidence and defer only that reference; other date lookups continue after three seconds. A fake-source coordinator regression confirms a valid order is verified immediately after an unsupported reference. Updated backend activation and progress verification are in progress.

Continuation verified: backend restarted with the retry-isolation fix; the date error cleared, verified purchase dates increased from 513 to 585, and the stuck initial purchase window completed. Remaining dates/history continue in the background. The supplied CSV/API financial comparison is complete; historical app coverage is explicitly not claimed complete. Private report: `.local/reconciliation/report.md`.

## Calculation speed and clear readiness — 2026-11-07

- [x] Index normalized row headers once instead of scanning every field for every amount rule.
- [x] Reuse an order-history index across date selections; retain CSV duplicate/pending semantics and avoid repeating adapter-resolved source identity matching.
- [x] Batch arriving source revisions, preserve the latest saved reading, and bound worker processing with a visible timeout/error.
- [x] Separate Results ready from background history/date syncing; show applied revision and calculation phase without claiming source completeness.
- [x] Verify financial equivalence and focused regressions, then build the updated frontend.

## Seller-facing sync, filters, exclusions and product identity — 2026-11-07

- [x] Diagnose the current token-refresh failure without printing credentials; distinguish network/service failures from rejected credentials and make recovery actionable.
- [x] Restore explicit Order cycle / Report activity choices for API data and align responsive filter controls.
- [x] Replace long scope/pending panels with counts and a compact, paginated reason-by-order/transaction dialog.
- [x] Use real API item titles, retain technical financial paths only as evidence, and cache actual catalog thumbnails by ASIN.
- [x] Verify focused financial/UI regressions, build, and activate backend changes while preserving caches.

External dependency: Catalog image requests currently return 403. Product Listing access must be granted by the owner; real photos remain unavailable until then. Titles, financial sync, and the implemented image cache/fallback work independently.

Validation completed: 90 focused tests passed, plus two browser checks at 1280px and 390px. Typecheck/build passed. Live token exchange succeeded; financial/order sync errors cleared, covered-history checks fell to zero. Catalog requests returned 403 and require the owner’s Product Listing access. No photos are claimed retrieved. The active backend was restarted with the final tested source; existing source caches and credentials are preserved.


## Compact sync and calculation loading — 2026-11-08

- [x] Move background sync into a small header indicator with expandable progress/errors.
- [x] Show responsive shimmer placeholders during automatic calculations and deferred date changes.
- [x] Respect reduced-motion preferences and retain accessible loading text.
- [ ] Tests, build and browser verification: deferred until explicitly requested by the owner.

## Purchase-date live orders — 2026-11-08

- [x] Include all recorded order activity immediately, including deferred sales, fees, refunds and reimbursements; retain source replacement deduplication.
- [x] Select orders only by verified purchase date; apply later updates to that original period and preserve missing-date review.
- [x] Keep Orders API summaries independently of financial rows so new orders appear before financial postings, without inventing revenue or fees.
- [x] Remove release-gated dashboard controls, pending-sales labels and exclusion reasons; keep source statuses as audit evidence.
- [x] Update cache migration, documentation and author regression coverage. Do not execute tests/build/browser checks until requested.

- [ ] Run verification and activate the updated local app only after the owner requests it. No tests/build/browser checks or live probes were executed for this change.

## Local startup recovery — 2026-11-08

- [x] Identify the old backend still occupying port 8788; preserve source cache and private credentials.
- [x] Acquire the loopback listener before opening the shared cache, so duplicate launchers fail without starting another sync worker.
- [x] Replace the generic credential/setup failure with safe startup-stage/error-code diagnostics.
- [x] Restart the existing repository backend with the updated source; startup readiness confirmed by the launcher. No test suite, browser checks or frontend rebuild run.

## Quiet background updates — 2026-11-08

- [x] Keep completed dashboard content mounted during background fetch/calculation/save; show skeletons only for initial data preparation and user filter transitions.
- [x] Compare record content, not JSON object-key order, before publishing source revisions.
- [x] Skip worker normalization and dataset replacement for unchanged delivery content; persist the acknowledged revision without changing the calculation timestamp.
- [x] Preserve change detection for order metadata, added/changed/removed records and forced mapping migrations.
- [x] Author regression cases and update documentation. No tests, build, browser checks or backend restart unless requested.

- [ ] Verification and activation deferred: no tests, build/typecheck, browser checks, live probes or restart performed.

## Netlify on-demand relay and client-only source storage — 2026-11-08

1. [x] Add a bounded same-origin, allowlisted Netlify relay; keep credentials/tokens transient and responses uncached, with no server database or scheduled jobs.
2. [x] Add browser-only credential/session handling and an IndexedDB source cache with atomic pagination checkpoints and account isolation.
3. [x] Move hosted history discovery, incremental merges, rate scheduling and explicit Sync/Stop/Resume into the browser; keep local mode available.
4. [x] Reuse current normalization, purchase-period calculations, quiet updates and manual report fallback.
5. [x] Add responsive hosted connection controls, deployment configuration and documentation; author regression cases without executing them.
6. [ ] Tests/build/browser checks, publishing, commit/push and deployment remain deferred until requested.

## Deferred: manual sync must recheck selected order histories

- [ ] Remove the six-hour freshness gate for linked financial histories when the user explicitly clicks **Sync now**. Recheck selected purchase-period orders for later sales, fees, refunds and reimbursements from Amazon, even if cached histories were checked recently. Keep cached records, source-ID deduplication, actual-change-only recalculation, API rate pacing and resumable pagination. Do not introduce automatic scheduled fetching.
- Deferred at the owner's explicit request to conserve quota. The six-hour gate remains in the implementation; the fix and tests remain deferred. Commit/push of the current implementation was separately authorized by the owner.

## Publication checkpoint

- Owner reported a successful hosted build and authorized committing/pushing the prepared source to main. No automated tests or browser checks were run in this publication step. The six-hour history-refresh fix remains deferred.

## Follow-up — displayed sales consistency

Pending: separate Amazon-reported order totals from historical SKU-average estimates. Current independent device histories can change those estimates, even when active order counts match. Do not claim identical financial data or totals from the metadata fix alone.

## Android live mode and alerts — current implementation
- [x] Opt-in foreground sync every 150 seconds while away/locked, silent ongoing notification and Stop action; retain Android scheduled fallback and enforce OS timeout.
- [x] Deduplicated new-order / recorded-refund alerts, default sound, status and fulfillment labels, cached product pictures when available; no historical alert flood.
- [x] Move connection and order-coverage cards to Settings; match native system bars to selected theme.
- [ ] Compile signed update and perform focused device check; no broad tests or push.

Android 0.1.4: web and signed native builds passed; signature verified; installed over wireless debugging preserving data. Updated process stayed running with no fresh crash log. Visual Settings/theme and live-mode permission check requires the phone to be unlocked. No fabricated order/refund notifications, broad tests or push performed.

## Local UI responsiveness repair
- [x] Stop status-only polling from invalidating expensive scoreboard calculations.
- [x] Replace per-order full-history metadata scans with one indexed pass, preserving first-match behavior.
- [x] Acknowledge unchanged source revisions in memory without reserializing the entire saved reading; replay safely after restart.
- [x] Web/native builds and APK signature verification passed; no browser/test suite or push.

Performance repair: signed Android 0.1.5 prepared. Full initial-load / actual-change serialization remains a profiling follow-up; no claim of measured end-to-end freeze elimination.

## Whole-app performance and cleanup pass
- [x] Audit runtime dependencies and unreachable modules across frontend, backend, Android and tooling.
- [x] Reduce unnecessary dashboard work and large-reading storage overhead without changing financial rules.
- [x] Run focused sync/normalization/cost/analytics/storage regressions, one analytics benchmark and type/build checks.
- [x] Record actual removals, measured results and remaining limits. No push or deletion of seller data.

Whole-app pass: 60 distinct focused unit/integration checks passed across targeted runs; 3 browser checks passed (worker HTTP/codec and desktop/mobile exclusions flow). All runtime dependencies are used; removed five unreachable legacy UI components instead. No live Amazon tests, seller-data deletion or push. Android 0.1.6 packaging follows the shared changes.

Whole-app delivery: frontend/server typecheck and production build passed. Android 0.1.6 signed, signature verified, installed wirelessly with existing data retained, and launch requested successfully. The currently running local Node process must be restarted once to load the backend GET optimization; built frontend changes apply after reload. No push performed.

## Android crash / lifecycle sync / confirmation alerts repair
- [x] Retrieve actual crash and service state from phone. Available OOM traces predate the current build; the reported current crash was not reproduced.
- [x] Preserve live-sync preference through system stop/timeout, recover from visible app entry, and keep scheduled fallback; distinguish explicit Stop from lifecycle handoff.
- [x] Release abandoned UI writer leases on backgrounding, automatically drain staged pages on foreground polling, resume after interrupted handoff.
- [x] Fetch order changes by LastUpdated timestamps without incorrectly marking purchase-date coverage complete.
- [x] Deduplicate new-order and confirmation notifications separately; confirmation must alert even if original Pending notice was dismissed.
- [x] Focused regression/build checks and signed update; no push or seller-data clearing.

Android repair checks: 21 focused TS regressions and 9 standalone Java notification-policy checks passed. Production web build and signed native build passed. On-phone service restored automatically and fetched data while on Home (19:12:25 IST), with no new crash observed. No fake order/refund notifications were sent. Final 0.1.8 also removes the stale Stopping message and refreshes the native fetch timestamp.

Final delivery: Android 0.1.8 installed wirelessly, signature verified, preference/service auto-restored. Background fetch and return were checked on-phone without pressing Sync; no fresh Java crash during the check. Current crash cause remains unconfirmed because only older OOM traces were present. Notification transitions are covered by deterministic checks; no fake notification was sent.

## Unified automatic sync, snapshot earnings and live preferences — approved scope
1. [x] Implement Gross sales and Net earnings (refunds, net marketplace/Easy Ship fees, reimbursements), preserve Profit separately, expose pending/estimates and remove missing-order-date posting fallback.
2. [x] Persist validated preferences: 2–5 minute interval (default 3), Wi-Fi-only, snapshot card visibility/order/default period, tax display, estimates/missing costs, notifications/sound, theme/density/number formatting. Changes apply without APK reinstall.
3. [x] Make pull-down-at-top request one immediate sync; retain visible data, coalesce repeated refreshes, remove routine Sync/Live enable controls and move recovery actions into Advanced.
4. [x] Automatically start foreground/background sync after connection. One device-owned pipeline fetches, merges, calculates and saves; use the existing JS engine in a bundled headless Android runtime rather than duplicate financial formulas in Java. Respect OS notification permission/system-stop/runtime limits.
5. [x] Revisit selected orders' later histories on explicit refresh, preserve purchase-date attribution and identity deduplication. Apply configured interval to desktop and Android; completed results remain durable.
6. [ ] Focused core/preferences/sync/lifecycle/mobile checks, production/native build, signed Android update and device checks. Preserve credentials/raw history/settings. No push.

Implementation checkpoint: snapshot/cohort calculations, persistent preference controls, pull refresh, simplified connection controls, desktop background worker and Android shared headless runtime are written. Core/settings checks performed before the owner's stop instruction passed; the browser run was interrupted (exit 130) and no further tests/device checks are authorized. Gross remains on the previously agreed recorded-financial basis; the owner was asked whether they instead want all known order sales. Pending values remain separate until that definition is changed explicitly. Finish compilation/APK packaging only; no push.

Final implementation: protocol 6 / Android 0.2.0. Production web and desktop-engine bundles compile; native release compiles. Automated/browser/device tests remain paused at the owner's request; the interrupted browser case is not a pass. Final APK packaging only, no GitHub push. Local backend must be restarted once to load the new worker pipeline.

## Active — extend Products + Inventory/Restock; improved pull-to-refresh
- [x] Establish non-overlapping file ownership in docs/INVENTORY_HANDOFF.md for Antigravity.
- [x] Implement resistance-based pull orb, content displacement, release threshold, cancel/retract, reduced motion, queued-vs-running feedback and preservation of visible readings. Not runtime-verified.
- [ ] Codex: extend existing Product Performance list/detail with net proceeds, selectable useful metrics and equal-length prior-period comparison with explicit missing/zero baseline states.
- [ ] Antigravity: new inventory core, Amazon parsers, presentational components and authored checks only, within docs/INVENTORY_HANDOFF.md scope.
- [ ] Codex after handoff: integrate catalog/stock-only SKUs, inventory persistence, shared sync, settings, retention and deduplicated alerts. No parallel edits to shared sync/storage.
- [ ] Owner-authorized focused tests/build/device acceptance later. No test/typecheck/build/APK/install/push authorized now.
- [x] Codex Product Performance stage: extend existing list/details with net proceeds, selectable sales/units/orders/refunds/fees/cost/margin columns, equal-length previous purchase-period comparisons and guarded coverage/zero-baseline states. Reuse existing cohort selectors; download missing comparison history through the existing refresh coordinator without changing visible dates. Inventory/catalog-only products remain integration work after Antigravity handoff.
- [x] Author product-performance financial/coverage regression cases for later execution. No tests/typechecks/builds/installations run for these changes.

## Inventory integration complete in source — packaging delegated (2026-11-14)
- [x] Review/fix draft demand, quantity parsing, identity joins, root listing availability, manual stock, inbound assumptions and modal save handling.
- [x] Connect Products inventory/restock tab, physical counts, per-item settings, current stock/history, guarded recommendations and source/error freshness.
- [x] Connect desktop worker / Android headless / hosted browser optional inventory phase, fixed native/relay transport, independent versioned persistence and small version polling. Financial sync remains independent.
- [x] Persist stock status transitions and wire deduplicated Android notifications; no initial-state alert flood.
- [x] Preserve animated refresh, Product Performance improvements and PDF Save file bridge. Native bridge now version 7; existing keys remain compatible.
- [ ] Antigravity owns build, packaging/version increment and installation after READY gate. No tests, live API probes, app launch, push or data deletion.
