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
