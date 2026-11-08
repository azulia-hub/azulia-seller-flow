# Seller Analytics TODO

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
