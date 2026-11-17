# Latest APK — 2026-11-15

- Version 0.2.5 / versionCode 15, package in.azulia.seller. Existing signing key retained.
- Production TypeScript/Vite/desktop-engine build passed. Assets staged. Gradle assembleRelease passed (packaging retried outside sandbox after local networking/file-lock restriction; web build was not repeated).
- APK: android/app/build/outputs/apk/release/app-release.apk.
- Includes review error diagnostics, released-payment prerequisites, Easy Ship Delivered tracking, bounded legacy delivery discovery and correction of estimate-based review expiry.
- Wireless connection restored at 192.168.29.216:43523. Installation requested with adb install -r (preserves app data); see subsequent completion below. Earlier 43365 endpoint was unreachable.
- No functional test suite, app launch or extra live review sends performed. No push.
- Dashboard sync intervals, recent-order scheduler and financial formulas unchanged. Optional post-financial review work budget increased from 12 to 30 seconds; it can extend completion, but is not an established cause of browser/phone Pending divergence. Exact affected order ID is needed for diagnosis.

---

# APK Build & Installation Handoff

## 1. Web & Desktop Compilation Results

- **Web Build**: `npm run build` executed once.
  - TypeScript project check (`tsc -b`): Passed cleanly with 0 errors.
  - Vite production bundle: Generated in `dist/` (assets, worker scripts, WebAssembly, manifests).
  - Desktop background calculation engine: Bundled into `.local/engine/engine.mjs` via `scripts/build-device-engine.mjs`.
  - Zero unit, browser, device, or benchmark tests were executed.
- **Android Asset Staging**:
  - `node scripts/prepare-android.mjs` executed directly without repeating the web build.
  - Public web assets staged in `android/app/src/main/assets/web/`.

---

## 2. APK Packaging & Native Compilation

- **Version Bump**:
  - Incremented `versionCode` from `11` to `12` and `versionName` from `'0.2.1'` to `'0.2.2'` in `android/app/build.gradle`.
  - Package ID retained: `in.azulia.seller`.
  - Signed release configuration preserved using permanent release key in `.local/android-signing/`. Zero keys regenerated.
- **Native Gradle Build**:
  - `node scripts/build-android.mjs` executed once.
  - Compilation: BUILD SUCCESSFUL in 22s (Java compilation, D8 dexing, asset compression, release signing).
  - `ToolDownloads.java` hooks in `MainActivity.java` (request code 41) preserved intact.
- **Compiled Artifact**:
  - Path: `android/app/build/outputs/apk/release/app-release.apk`
  - Size: 10,205,248 bytes (~10.2 MB)
  - Version Code: `12`
  - Version Name: `0.2.2`
  - Target SDK: `36` (Android 16), Min SDK: `28`

---

## 3. Pixel 8a Device Installation

- **Device Discovery**:
  - Discovered connected Pixel 8a via wireless debugging at `192.168.29.216:37209` (product: `akita`, model: `Pixel_8a`).
- **Installation**:
  - Command: `adb -s 192.168.29.216:37209 install -r android/app/build/outputs/apk/release/app-release.apk`
  - Result: `Performing Streamed Install` -> `Success`
  - Preserved: All existing app data, SQLite databases, and Keystore credentials were preserved without uninstalling.
- **Verification**:
  - `dumpsys package in.azulia.seller`: Verified installed `versionCode=12`, `versionName=0.2.2`.
- **Launch Policy**:
  - Per instructions, the app was **not launched** and no device/functional checks were run. Testing remains paused.

---

## 4. Localhost Server Restart Status

- **Status**: **PENDING** (Safe restart pending in owner's interactive terminal).
- **Detail**:
  - The local server process bound to `127.0.0.1:8788` (PID 2756) is running in the owner's active interactive terminal session (`pts/25`, PID 2733).
  - To avoid terminating the interactive terminal session or causing address collision errors, process restart was not forced from this subshell.
  - To load the compiled background worker pipeline on localhost, press `Ctrl+C` in terminal `pts/25` and run `npm run local:start` once.

---

## 5. Security & Deployment Policy

- Zero secrets, signing passwords, or Amazon credentials were exposed or committed.
- No Git commits or pushes were made.

### Installation completed
Wireless adb install -r succeeded on Pixel at 192.168.29.216:43523. Package verification: versionCode 15, versionName 0.2.5. No uninstall, data clear or app launch performed.

### Desktop/phone order discrepancy diagnosed
For 408-7187698-9598707, Amazon read-only lookup returned Unshipped while desktop source retained Pending (last individual check 2026-11-15 14:39:47 IST). Desktop coordinator prioritizes creation-date/history purchase jobs and falls back to stale single-order metadata after six hours; hosted/Android uses a dedicated recent LastUpdated stream. No sync scheduler patch made in this packaging task. Align desktop recent-order refresh with the updated-order stream in a subsequent change; do not clear source storage.

### Desktop scheduler follow-up implemented
Desktop source now prioritizes LastUpdated recent orders independently of history, persists completed update watermarks atomically, and keeps changed-order catch-up separate from purchase coverage and Finance jobs. Mock regressions authored but not executed. Restart the local server to load server/local/sync changes. Installed Android 0.2.5 already has its recent-update stream and needs no additional APK for this desktop-only patch. No production cache edits or manual order-state overrides performed.

### 2026-11-15 — native review POST fix installed
0.2.6 / versionCode 16 compiled, signed, verified and installed with adb install -r.
Explicit JSON content type / HAL Accept / empty POST fixes the Android-only
InvalidInput response. Owner authorized live Send-button testing: baseline failed;
a fresh eligible order after the update was accepted and displayed Request sent.
Prior uncertain request guards and all seller data were preserved. No uninstall or
data clear. Private APK: .local/releases/azulia-seller-0.2.6.apk.

### 2026-11-15 — daily reviews and notifications
Signed 0.2.7 / versionCode 17 / bridge 10 built and installed in place via wireless
ADB. Default 14:53 IST, editable daily time, persisted all-candidate queue and paced
continuations. Fresh eligibility and existing per-order dispatch protections remain.
Accepted-count notifications use a dedicated Android channel with permission checks
and deduplication. Production frontend and device engine built; typecheck and 26
focused review tests passed. Desktop backend restarted successfully with retained
records and healthy order sync. APK: .local/releases/azulia-seller-0.2.7.apk.
Read-only local production-browser checks passed at 1280px and 375px: the daily
review time control defaults to 14:53 and stays inside the viewport. Existing
manual/automatic opt-in choices were not changed during verification. No extra
live review submissions were initiated by the schedule test.

### 2026-11-16 — background review notification repair verified
Installed signed 0.2.8 / versionCode 18 / bridge 10 in place on the owner's Pixel
via supplied wireless ADB address. Before repair, the phone's saved November 16
review run showed 219 accepted and zero remaining (313 historical sent total).
The headless bridge previously rejected reviews.notify. The capability policy now
allows that existing action, and notification exceptions no longer break the queue
continuation result. After installation, native notification permission was granted,
LiveSync resumed, and Android's notification record contained Review requests sent /
Amazon accepted 219 review requests. Saved sent/uncertain history was preserved;
no manual replay or history reset was performed. The summary retry used existing
accepted records. 27 review tests, Java capability checks, typecheck, production
build, signed APK packaging and signature verification passed. Retained APK:
.local/releases/azulia-seller-0.2.8.apk.

### 2026-11-17 — notification-tap deep navigation installed
Installed signed 0.2.9 / versionCode 19 / bridge 10 in place on the owner's Pixel 8a
(`192.168.29.216:33493`) via wireless ADB (`adb install -r`). Streamed install
succeeded. Package verification confirmed versionCode=19, versionName=0.2.9.
All existing app data, SQLite databases, Keystore credentials, and review history
were preserved without uninstalling or clearing data. Retained APK:
.local/releases/azulia-seller-0.2.9.apk.

### 2026-11-17 — notification navigation repairs, multi-SKU orders & Arabic banner installed
Installed signed 0.2.10 / versionCode 20 / bridge 10 in place on the owner's Pixel 8a
(`192.168.29.186:35611`) via wireless ADB (`adb install -r`). Streamed install
succeeded. Package verification confirmed versionCode=20, versionName=0.2.10.
All existing app data, SQLite databases, Keystore credentials, review history,
and sync preferences were preserved without uninstalling or clearing data. Retained APK:
.local/releases/azulia-seller-0.2.10.apk (SHA-256: 9739b3b40cc3ce8d8e76f9329b12a6518b5b667fd7edf105817fb99aecb22816).

### 2026-11-17 — top Arabic invocation banner with slender typography installed
Installed signed 0.2.11 / versionCode 21 / bridge 10 in place on the owner's Pixel 8a
(`192.168.29.216:38747`) via wireless ADB (`adb install -r`). Streamed install
succeeded. Package verification confirmed versionCode=21, versionName=0.2.11.
Positioned invocation banner across the top above topbar header; applied slender regular typography
(Amiri / Scheherazade New / Noto Naskh Arabic, font-weight 300/400 with antialiasing) matching the theme.
All existing app data, SQLite databases, Keystore credentials, review history,
and sync preferences were preserved without uninstalling or clearing data. Retained APK:
.local/releases/azulia-seller-0.2.11.apk (SHA-256: 7ea3851ad50d289b142f56e6e7ca82d108ab898681c5b5bee1c2d409c81225d8).
