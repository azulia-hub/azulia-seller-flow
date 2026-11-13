# Azulia Android — native device backend

Source for a personal Android app, targeting Pixel 8a. Android 9+ minimum, target/compile SDK 36. Android 16/17 device behavior has not been verified.

The app loads `https://azulia-hub.github.io/azulia-seller-flow/` only after its `device-bridge.json` declares bridge 3 compatible. Otherwise it opens the bundled web build. Startup checks website compatibility with a short timeout and uses the bundled interface when offline or incompatible. There is no native title/action toolbar. Existing Azulia branding is used for the launcher and startup. An old GitHub website without this manifest cannot accidentally replace the native-capable bundle. Desktop and phone have independent data.

Native responsibilities:

- AndroidX WebKit message bridge: exact HTTPS origins, application path and main frame only; no arbitrary JavaScript interface, SQL, filesystem or generic HTTP capability.
- Fixed India/EU Amazon HTTPS operations, native access-token renewal; access tokens never leave native code. The credential form temporarily passes user-entered credentials to native code; stored credentials are AES-GCM encrypted using Android Keystore. Forget removes authorization but retains data.
- Private SQLite for source records, prior versions, checkpoints, costs and completed readings. Source writes and checkpoint changes commit atomically with optimistic version checks. Large JSON values are split into chunks below SQLite CursorWindow row limits. No automatic expiry.
- Local product image files, validated host/redirect/size/raster format; requested thumbnails are downloaded and retained. No title/image is fabricated if Amazon does not supply metadata.
- Existing TypeScript financial readers, source-page reducer, sync planner, normalizer and calculations run in the WebView. No Node, Netlify or cloud database is needed on the phone.

The refresh lifecycle clears the replaced document's writer lease without deleting its source jobs. Credentials remain encrypted, sync resumes from retained checkpoints. A running request may finish after navigation, but its old document cannot use the reply to advance new checkpoints. Basic native background fetching is enabled after connecting Amazon. Android JobScheduler requests a persisted network job at the system minimum interval (normally 15 minutes); Android may delay it for battery/network limits. It fetches recent Orders and Finance pages without the WebView, retains exact response text and its own pagination checkpoints in SQLite, and retries temporary failures. Up to four pages are fetched per run, with a 90-second budget and at most 32 unapplied pages. Three-day overlap finds recent changes; saved windows allow catch-up in bounded 30-day ranges. Opening the app applies queued pages through the existing parsers/reducer, then updates calculations. Page ingestion and queue acknowledgement are atomic. Historical backfills, per-order enrichment and catalog/images still use foreground sync. Forget credentials cancels the scheduled job. Android force-stop prevents jobs until the app is opened again.

## Current compiled APK

Signed release 0.1.3 (version code 4) compiled successfully on 2026-11-13. APK signature verification passed; the bundled interface/native classes are present and private credentials/signing files are excluded. Installable copy: `.local/releases/azulia-seller-0.1.3.apk`, with an adjacent SHA-256 file. For v0.1.3 the owner authorized a focused on-phone launch check: installation, startup logo, dashboard loading and no fresh crash were confirmed on the Pixel. No broad test suite/emulator or separate Amazon API probe was run; normal connected-app sync may run during launch. Nothing was pushed.

GitHub Pages is optional: the bundled interface, native connection, device storage and calculations work without hosting the website. Internet is required for fresh Amazon data. The interface runs in Android WebView; it is not a separately rewritten native UI.

## Build locally

This workstation now has verified JDK 17, Gradle **8.13**, Android SDK platform **36**, build tools **35.0.0** and platform tools installed privately under `.local/android-tools/`. The build script automatically uses these tools; system Java is unchanged. On another machine, install those same tool versions. For a different SDK installation, set `ANDROID_HOME` or use ignored `android/local.properties`. For direct CLI use here, run `source .local/android-tools/environment.sh`. No Gradle wrapper download/bootstrap is bundled. Android Studio can open this directory too.

From the repository root:

```sh
npm run android:signing  # first setup only; the current signing key already exists
npm run android:apk
```

`android:signing` requires JDK `keytool` and creates private files in `.local/android-signing/`; it refuses to replace an existing key. **Back up that entire folder securely.** Losing/changing the signing key prevents installing an update over the existing app. Never commit or share the key/password. `android:apk` builds the current web UI, copies only public `dist/` output into the APK, then signs `android/app/build/outputs/apk/release/app-release.apk` with that key. No Amazon credentials are embedded.

Install the APK on the phone and approve installation from that source. Open Azulia, enter your own Amazon client ID, client secret and refresh token, then choose a range to sync. Permission acceptance and live results have not been verified by this implementation task.

## Manual GitHub Actions build

`.github/workflows/android-apk.yml` runs only via **workflow_dispatch**. It builds and uploads an APK artifact; it does not publish a release or deploy the website. Nothing was pushed or triggered by the agent.

The default debug artifact is for preview. GitHub runners generate new debug keys, so these previews do **not** guarantee in-place updates. For retained data across updates, use one permanent release key from the first installed version.

For a signed release, configure these repository Actions secrets yourself from your private signing files:

- `AZULIA_KEYSTORE_BASE64`: base64 bytes of `release.jks`
- `AZULIA_STORE_PASSWORD`: private signing password
- `AZULIA_KEY_ALIAS`: `azulia-release`
- `AZULIA_KEY_PASSWORD`: same generated password

Then manually run **Build Android APK (manual)** with `release` enabled. Build instructions use the official [AGP 8.11 compatibility matrix](https://developer.android.com/build/releases/agp-8-11-0-release-notes) and [AndroidX bridge API](https://developer.android.com/develop/ui/views/layout/webapps/native-api-access-jsbridge). WebKit 1.12.1 is pinned; platform SQLite avoids adding Room/Kotlin/KSP for a small generic JSON transaction store.

## Deliberately pending

- APK compilation and signature verification passed. Actual Android device/UI behavior and live Amazon permissions remain unverified.
- Signed APK update discovery/download/verification/install UI and version-code automation are the next stage. Until then manually install a higher `versionCode` APK signed with the same key. Compatible website changes can load on the next app launch without reinstalling.
- Basic closed-app Orders/Finance fetching is implemented. Background device/OS execution remains unverified; full historical/enrichment background jobs and complete encrypted export/import backup remain pending.
- Native Android download/export support for generated JSON/XLSX/PDF files remains pending. Existing report upload inputs open Android's document picker, but browser blob-download flows are not yet a complete APK workflow.
- Raw transaction/calculation data and images are private app storage, not encrypted database contents. Android system backup is disabled. Clearing app storage or uninstalling removes them; browser site-data clearing does not remove native SQLite.
- Large histories still use the existing full normalization/analytics pipeline when source content changes; this is not a new incremental calculation engine or a claim of identical snapshots across independent devices.

Website/bridge protocol is now 3: older APKs fall back to their own compatible bundle when a newer website requires this background queue API. Install version 0.1.1 over the previous APK using the same signing key to preserve credentials and data.

Version 0.1.2 prioritizes displayed/recent order titles and images during ongoing financial history sync; open order popups update live. Pending metadata remains explicit if Amazon has not supplied it or permission is denied. Reading adapter 15 refreshes existing cached metadata once. Financial calculation rules are unchanged.

Version 0.1.3 fixes the confirmed Java-heap launch crash: readings use bounded chunk reads, renderer gzip and atomic chunk uploads instead of full native JSON parsing. Existing readings, source records and credentials are retained. Bridge protocol is 3.

### Live sync and alerts (0.1.4)
Open Settings → **Enable live sync & alerts**, then allow Android notifications. The silent ongoing notification offers Stop. Checks run approximately every 2½ minutes while away or locked, subject to connectivity, Amazon limits and Android scheduling. Android 15+ limits dataSync background sessions to six hours per day; enable from the visible app again when permitted. The existing scheduled fallback remains available. Force-stop prevents background work until reopening.

New orders and recorded refunds use the normal notification sound. Pending/unshipped and FBA/FBM labels come from Amazon. Refund does not establish physical return receipt. Available photos/titles quietly enrich active notifications; Amazon can withhold item details for Pending orders. No historical alert flood on enabling. Native staging preserves pages; open the app to apply them to calculations. At 1,024 unapplied pages background fetching pauses rather than dropping records. Connection and coverage panels now live in Settings. Theme selection updates Android status/navigation bars too.

### Lifecycle and confirmation repair (0.1.8 / bridge 5)
Live opt-in survives system stops/timeouts and resumes from visible app entry; explicit Stop still disables it. Android may restart the sticky service when allowed, while scheduled fallback remains available. The background handoff clears abandoned UI leases; foreground polling automatically applies staged pages and retries. Updated-time order refresh includes changes to older purchases without claiming new creation-date coverage. Confirmation has its own alert ID and sound, including when Pending was dismissed; missing fulfillment no longer defaults to FBM. Bounded renderer-loss recovery retains data; local OS reason codes help diagnose actual closes. Do not promise uninterrupted two-minute polling after force-stop or beyond Android's dataSync allowance.

Standalone notification-policy checks (no emulator/dependency): compile `OrderNoticePolicy.java` together with `android/checks/OrderNoticePolicyCheck.java` into a temporary directory with JDK 17, then run `in.azulia.seller.OrderNoticePolicyCheck`.

### Unified automatic processing (0.2.0 / bridge 6)
Amazon connection automatically starts one fetch → merge → calculate → save pipeline. The live service uses the interval in Settings (2–5 minutes, default 3); JobScheduler fallback runs the same bundled runtime when Android permits. A small headless WebView reuses TypeScript financial logic without the dashboard UI or a duplicate Java financial engine. Completed readings are durable and source-revision checked. The visible app displays the last completed result, then applies new completed data without page reload. Pull down at the top for immediate refresh; desktop also supports Alt+R. Recovery controls do not delete source history.

The engine is bundled; existing supported preferences apply without reinstalling, but changes to native capabilities or the bundled financial engine require a compatible APK. Android service timeouts, notification permission, explicit system Stop and network restrictions still apply. New-order/confirmation/refund sound preferences choose Android notification channels; system channel/DND settings remain authoritative. All seller source records, credentials, costs and committed readings are retained. Only incomplete upload staging can be discarded before a fresh engine run.

Final acceptance tests were stopped at the owner's explicit request; do not describe the new headless runtime as device-verified merely because it compiles.
