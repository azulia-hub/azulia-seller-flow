# Amazon Ads validation handoff — 2026-11-18

The owner requested stopping Codex testing after the current browser run and
handing full validation to Antigravity. No commit/push, cloud deployment, APK
installation, campaign edits or customer review submissions are requested.

## Implemented

- Desktop-only separate Ads credential setup (`npm run ads:setup`), token renewal,
  verified INR/India seller profile, fixed EU Ads API requests.
- Persistent async Reporting v3 jobs/cooldowns, bounded gzip/S3 downloads, raw
  observations and replacement of completed date windows without double counting.
- Existing Sponsored Products selectors receive seven-day click-attribution
  reports. Financial booked ads, missing-cost rules and unknown raw columns stay
  intact. Manual workbook upload remains a separate selectable fallback.
- Advertising/Settings connection panel, selected-date history and explicit refresh.
- No native Android Ads transport. Native seller credentials are unchanged.

Read AGENTS.md, PROJECT_CONTEXT.md, ARCHITECTURE.md, DECISIONS.md (ADR-087) and
ROADMAP.md before reviewing or modifying code. Relevant new code is under
`server/local/ads/`, `src/adapters/amazon-ads/`, `src/app/useAdsConnection.ts` and
`src/components/AdsConnectionPanel.tsx`; integration touches server start/routes
and App.tsx. Preserve the owner's pre-existing `src/styles/workspace.css` and
`todo.md` changes. Do not reset credentials, caches, settings, source data or tokens.

## Completed validation

- Typecheck and production web/background-engine build passed.
- 36 focused adapter, Ads integration, local-backend and advertising-core tests passed.
- The final running browser tests passed at 375px and 1280px (2 tests).
- The subsequent local activation exposed Node strip-only incompatibility with
  an AdsError constructor parameter property. It was rewritten as ordinary fields.
  Per the owner's stop request, tests were not rerun after that runtime-only fix.
- Existing localBackend credential tests were isolated with explicit fixture
  paths. Previously they resolved the real home credential file and printed
  secrets in assertion output. Never repeat that unsafe test configuration.

## Run all validation

1. Audit credential-loading test isolation before running suites. All test Amazon
   requests must be mocked; do not allow assertions to dump real credential objects.
2. Run `npm run typecheck`, `npm test`, `npm run build`.
3. Run all browser and PWA suites using the installed browser:
   `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`
   and the same prefix with `npm run test:pwa`.
4. Run existing Java checks under `android/checks/` with their established harnesses.
   Discover and run any other documented automated checks; do not install an APK.
5. Fix regressions in scope and rerun affected checks. Separate existing baseline
   failures from new failures with concrete evidence; do not disable expectations.
6. Verify the production local backend starts under Node strip-only mode and
   exposes the guarded `/api/ads/status`, `/api/ads/report`, `/api/ads/sync` routes.
   Check secrets/tokens are absent from HTTP responses and build artifacts without
   displaying their values. Test no-report/error/retry/manual-fallback states.
7. Check selected-date changes, zero-activity windows, overlapping refreshes,
   account mismatch, provider cooldowns/restarts and malformed-source retention.
   Review range queue behavior and API edge cases rather than relying only on mocks.

## Remaining activation requirement

India seller profile: `1945769505015317`, seller `A3PU97R0GNM6NT`, RoyalFurnitures53.
The original token was verified with HTTP 200; the private project-local bootstrap
credentials do not include the client secret and the initial token may be expired.
Automatic renewal needs the owner to enter the matching Ads secret locally:

```sh
npm run ads:setup -- --tokens tokens.json --profile 1945769505015317 --seller A3PU97R0GNM6NT
```

The prompt is hidden. Prefer the private home credentials file; do not print or
copy its contents into reports. Do not commit tokens.json or .local files.
Live Ads report creation/poll/download is needed to claim end-to-end activation;
mock tests alone do not establish that. Do not send customer review requests or
edit campaigns/bids/budgets during verification. Ask the owner for the missing
credential step rather than silently reusing SP-API secrets.

Report commands, totals, actual backend status, remaining limitations, and fixes.
Do not claim Android Ads is connected or full live report parity is established.
