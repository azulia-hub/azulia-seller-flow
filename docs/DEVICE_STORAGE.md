# Device-owned storage

## Stage 1: desktop

Run `npm run local` and open `http://127.0.0.1:8788/`.

| Location | Contents |
| --- | --- |
| `.local/activity-cache/` | Existing account-specific Amazon records, history, order/catalog metadata and sync checkpoints |
| `.local/device-data/workspace.sqlite` | Completed automatic readings, costs, classification rules and missing-cost policy |
| `.local/product-images/` | Downloaded thumbnails and sidecars containing original URLs |
| `.local/amazon-credentials.json` | Existing private desktop credentials, separate from application storage |

Files remain until explicitly removed. Clearing browser site data does not delete them. View preferences and manual fallback imports retain their existing browser storage/export path; this is not a full browser backup.

Existing browser costs/rules and completed automatic readings seed empty device entries. Durable settings win on later visits. Concurrent settings edits use version checks: a stale window displays an error rather than overwriting another save; reopen that window before retrying. Storage failures are visible.

Report calculations, purchase-date attribution and quiet background updates are unchanged. Readings retain source comparison baselines to avoid recalculating unchanged fetches. IndexedDB remains a compatibility mirror; a full browser cache does not block a successful device save.

Images download when thumbnails are requested, with four concurrent downloads, a 5 MiB limit per image, validated raster contents and a fixed Amazon image-host allowlist. Later requests reuse local bytes, including without internet. Node must still run to serve the local app/files. Missing Amazon metadata is not invented. This does not download every product image in advance.

There is no automatic age-based deletion or fixed disk-size promise. Keep `.local/` private and out of Git. For a consistent filesystem backup, stop the server before copying the entire `.local/` directory, including SQLite sidecars if present. Existing JSON exports do not include image files or all source history. No dependency was added.

## Stage 2: Android source

The native Android source now implements the device bridge, Keystore-protected Amazon authorization, native HTTPS, chunked private SQLite, atomic source/checkpoint writes and retained thumbnails. The existing TypeScript source-page reducer and financial parsers are shared with desktop/hosted delivery. The shell selects a compatible GitHub Pages build or the bundled web interface; these origins use the same phone database. Ordinary hosted browsers keep IndexedDB.

See [Android setup and build instructions](../android/README.md). A manual GitHub Actions APK build and local stable-signing scripts are included. Project-private build tools are installed. Signed release APK compilation, signature verification and bundled-file inspection passed on 2026-11-12. Actual phone/device verification remains pending. No test suite, emulator, Amazon request or publication was run.

Phone and desktop stores remain independent without explicit transfer. Integrated signed APK updates, complete encrypted backup, native generated-file exports and broader historical/enrichment background jobs remain pending. Basic JobScheduler Orders/Finance fetching now stages raw pages/checkpoints while closed and ingests through existing parsers on reopening; OS/device scheduling is unverified. Native data persists through browser site-data clearing; clearing Android app storage or uninstalling deletes it.

## Desktop large-reading fix (ADR-078)

Large desktop readings use gzip HTTP uploads/responses and compressed SQLite storage. Compressed requests are limited to 32 MiB and decoded readings to 256 MiB; failures are visible. Existing plain JSON readings remain readable by the new backend. Browser fallback uploads remain unchanged. Restart the local server after this update, then reload the page. Source records and financial calculations are unchanged; no cache clearing is required. A dashboard save error no longer reports that Amazon background sync is paused. Android transport is unchanged by this desktop fix.
