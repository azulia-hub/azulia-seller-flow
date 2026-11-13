# READY FOR BUILD

Codex has finished source integration and is handing off exclusively to Antigravity for compilation, packaging and installation. Codex is no longer editing source. This is a build-readiness handoff, NOT a claim of functional verification.

## Included source changes
- Existing Product Performance list/details: proceeds, selectable figures, guarded equal-length prior-period comparisons and history requests.
- Products → Inventory & restock tab, source freshness/errors, stock-only catalog rows, per-item physical counts/replenishment settings, stock history, status-transition alerts.
- FBA inventory + Listings Items fixed read-only endpoints via existing desktop credentials / native Amazon transport / stateless browser relay.
- Optional bounded stock fetch in existing automatic pipelines, independent from financial calculation success. Normal inventory cadence 15 minutes; explicit refresh may bypass it. Financial cadence unchanged.
- Account-scoped CAS storage and settings separation; small version queries avoid repeatedly loading unchanged inventory. Native large inventory values use existing chunked codecs.
- Actual stock recommendations replace the legacy sales-only dashboard Restock alerts modal. Demand is a covered purchase-date proxy of confirmed shipped orders; actual shipment dates/historical stockout proof are not available. Partial metadata stays explicit. Unknown stock is not zero. Inbound offsets require a user assumption.
- Pull-to-refresh animation and generated PDF/CSV saves with new native ToolDownloads helper. Preserve MainActivity helper hooks.
- Native bridge 7 in Java/TypeScript/public manifest. Existing seller records/credentials remain intact.

## Antigravity tasks (authorised)
1. Read AGENTS.md and docs/PDF_DOWNLOAD_HANDOFF.md. Preserve all unrelated uncommitted changes.
2. Run `npm run build` ONCE. This performs compilation and builds web/private desktop engine. Do not run tests, benchmarks or live API probes.
3. If compilation fails: record exact diagnostics and stop for Codex/user. Do not independently edit shared source files. Do not hide errors or alter calculations to force a build.
4. After success, run `node scripts/prepare-android.mjs` directly. Avoid `npm run android:apk` / `npm run android:prepare` here: they repeat the completed web build.
5. Read existing Android/project and installed Pixel 8a versions; increment versionCode (and versionName as appropriate) in android/app/build.gradle for a normal update. That file is yours for packaging only. Keep package ID and existing private signing key. Never regenerate signing material or reveal secrets.
6. Run `node scripts/build-android.mjs` ONCE. If Java/native compilation fails, record diagnostics and stop for Codex. Rebuild only after a concrete fix.
7. Discover Pixel 8a via adb; install the new APK with `adb -s <device> install -r <apk>`. Never uninstall/clear storage. Do not launch the app or run device checks; testing is still paused.
8. To activate localhost changes, stop only the existing Azulia process bound to 127.0.0.1:8788 and restart `npm run local:start` ONCE after compilation. Avoid `npm run local` because it rebuilds. Do not launch a duplicate listener or kill unrelated Node processes. If process ownership/terminal prevents a safe restart, report that restart is pending.
9. Write docs/APK_INSTALL_HANDOFF.md with compilation result, APK path/version, install result and local restart status. No credentials, signing passwords, raw seller data or screenshots.

No unit/browser/device tests, app launch, cloud deployment, commit or push authorised. No storage resets, migrations deleting data or dependency installations. If the phone is unavailable, report installation pending rather than claiming success.

## Later acceptance work — not authorised now
Validate real inventory permissions/data, save/pull-refresh gesture, pagination interruption, stock history/settings, duplicate-notification protection, APK launch and PDF/CSV file opening. Regression sources exist but were not executed. Review these before declaring production reliability.

Official endpoint references used during implementation:
- https://developer-docs.amazon/sp-api/lang-en_US/reference/getinventorysummaries
- https://developer-docs.amazon/sp-api/reference/searchlistingsitems
