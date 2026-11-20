# Advertising workspace integration — 2026-11-20

Antigravity's READY handoff has been reviewed and integrated into the real app.
The legacy Advertising page is replaced by a lazy-loaded workspace. Connection
setup remains in Settings. Financial product pages can open Ads investigations.

Implemented: account/product/versioned manual-group scopes; weighted ratios;
compatible posting-period financial principal for TACOS; product-scoped campaigns;
search-term and targeting evidence explicitly labelled as shared ad groups; purchased-
product cross-sales with conservative ASIN/SKU mapping and explicit selected-group
membership. Alternative report grains never increase headline spend or sales.
Current configured bids/status and automatic catalog-parent families remain pending.

Review corrections include one-based/clamped pagination, null monetary values
remaining unavailable, no zero metrics outside downloaded coverage, preserved scope
when navigating between product/campaign details, keyboard focus containment/return,
Escape handling after entity changes and mobile touch sizing. Manual group membership
does not establish catalog parentage; the cross-sale badge says “In selected group.”

Validation:

- 37 focused calculation/parser/source/storage regressions passed across nine files.
  A subsequent direct-Node runtime import regression raised the total to 38; all nine
  Ads integration tests passed outside the subprocess-restricted sandbox.
- All 12 isolated and real-app Playwright checks passed at 375px/1280px, including
  nested campaign scope, modal Escape, weighted group ACOS, persistence after reload
  and no horizontal document overflow.
- Typecheck, production web/headless-engine build and signed Android release passed.
- A real backend restart exposed an extensionless import in the supplemental adapter;
  it was corrected and the strip-types Node service import checked directly.
- Backend restarted successfully with 14,826 retained financial records. All four
  live Ads sources reported configured/verified, idle, accepted revisions and no
  error (product revision 5; search-term/purchased-product/targeting revision 1).

APK: `.local/releases/azulia-seller-0.2.13.apk`, versionCode 23, bridge 12, SHA256
sidecar retained. Signing certificate matches 0.2.12. The archive contains the four
fixed report specifications and correct bridge manifest, and no known saved Ads
secret/refresh/access-token values. No installation, push or website deployment
was performed during this integration. Phone acceptance remains pending.

This is focused feature validation, not a claim that the entire repository suite
passed. Older advertising UX assertions describing the replaced page need migration;
the previously documented unrelated Android source-order fixture failure is unchanged.

## Owner-requested installation

2026-11-20: Installed the retained signed 0.2.13 APK over wireless ADB at
192.168.29.216:44427 using `install -r` (Success). Confirmed installed versionCode
23/versionName 0.2.13 and brought MainActivity to the foreground. No data-clear or
uninstall was used. Live supplemental-report acceptance on the phone remains pending.

## Ads corrections — 2026-11-21

ADR-090 adds fixed, read-only campaign/ad-group/keyword/target/product-ad lists,
profile-scoped cached configuration, real state and explicit/inherited bids, visible
review reasons, and pure bounded advisory recommendations with an editable ACOS
reference. Recommendations exclude the latest attribution window and do not execute
Amazon changes. Mobile tables become labelled cards; long names clamp with full-name
disclosure. Supplied product images and authenticated ASIN catalog images are shown
without constructing guessed image URLs. Purchased-product v2 requests/maps the
other-SKU sales, purchases and units, fixing promoted-field zeros. Old raw observations
remain retained, and missing old halo fields remain unavailable.

Validation: 37 focused tests, 14 browser checks, typecheck, production build and signed
Android build passed. Live read-only verification returned 83 campaign records; bids
were present on all inspected keyword/target rows. Corrected desktop purchased v2
completed with 82 rows, 38,363.90 INR halo sales and 64 units in the downloaded period.
One catalog lookup returned HTTP 200 with an image.

Installed 0.2.14/code 24/bridge 13 via adb install -r at 192.168.29.216:45451. Confirmed
version and opened the workspace; existing account/reports remained visible. Existing
signing certificate matched, report asset v2 and bridge manifest 13 checked, known
credential byte scan passed. Retained APK and checksum: .local/releases/azulia-seller-0.2.14.apk.
Phone source refresh is independent of desktop; detailed native targets/cross-sales
acceptance remains pending its first corrected report. No Ads writes were exposed
or submitted.
