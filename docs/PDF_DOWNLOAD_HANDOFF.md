# PDF tool download fix — source changes only

The tool previously exposed generated `blob:` URLs as download anchors. The Android activity does not implement a blob download consumer and rejects blob main-frame navigation, so conversion could succeed while tapping Download did nothing.

## Changes / ownership
- src/features/tools/ToolsPage.tsx: explicit save buttons, one save at a time, visible errors/cancel/completion, browser-only PDF preview.
- src/features/tools/saveGeneratedFile.ts: browser attached-anchor download with delayed URL revocation; Android bounded 64 KiB chunks through dedicated AzuliaDownloads port. Maximum 128 MiB per output, not full-file base64 in memory.
- src/features/tools/tools.css: button styles.
- android/app/src/main/java/in/azulia/seller/ToolDownloads.java: separate origin/path/main-frame validated WebKit message port, generated file names/PDF/CSV only, ordered bounded chunks in a temporary file, Android ACTION_CREATE_DOCUMENT picker, background copying, confirmation only after write completion, cancellation/cleanup.
- android/app/src/main/java/in/azulia/seller/MainActivity.java: isolated helper construction, navigation/renderer cleanup, activity result forwarding (request 41; existing upload uses 40), destruction cleanup.

No seller-data bridge protocol, inventory module, shared sync, database, dependency or Android permission change. Native download port is independent of DeviceBridge and absent from the headless sync runtime. Old APKs with updated website code show an explicit update-required error rather than silently losing downloads.

## Antigravity coordination
Do not replace MainActivity.java wholesale while integrating inventory. Preserve ToolDownloads field, construction, lifecycle and result hooks. Do not edit the above tool files as part of inventory integration. They can coexist with inventory changes to separate DeviceBridge actions. No changes were made to inventory-owned files for this fix.

## Later authorized validation / packaging
Owner forbids tests/build/APK/install for now. When authorized: typecheck Java/TS in the usual production build, compile a higher-version APK with existing signing key, check PDF/packing PDF/CSV downloads, picker cancel/retry, navigation during export, denied/failed destination, existing PDF upload, desktop browser download and Android actual file opening. Do not change label conversion/crop/printing layout. Installed APK currently does not contain this new native save helper; a future compiled update is required.
