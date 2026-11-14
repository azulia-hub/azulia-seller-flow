# Review-request implementation — source only

Implemented the existing account-scoped workspace pattern for review requests:
- Pure core state, due candidate selection, sticky original/replacement exclusions and one-control presentation.
- Fixed India Solicitations GET + POST transport; only HTTP 201 confirms creation. API availability does not prove whether Seller Central already submitted.
- Preserved IsReplacementOrder/ReplacedOrderId and delivery metadata through Orders parsing, desktop summaries, browser cache and canonical orders. Fresh single-order metadata is fetched before sending; missing replacement evidence prevents sending.
- CAS journal claim before submission; tiny review-attempt per-order guard is marked dispatched by Android/local before POST. Unknown outcomes and stale in-progress attempts never automatically resend.
- Source-side optional bounded checks in Android/headless, local worker and hosted/browser pipelines. AutoEnabled defaults false; opt-in stored separately from source data. Financial data remains independent.
- Settings management: search order/product/SKU/ASIN, status filter, bounded read-only checks, automatic preference, external-request user confirmation and provenance.
- LiveOrderList, PulseOrdersModal and InlineOrderDetail show a single Waiting / Send request / Request sent control. Action outcomes also appear as a short global notice.

Storage uses reviews:<account>, reviews-config:<account> and review-attempt:<account>:<orderId>. Large journals use compressed chunks; attempt guards remain small. Browser IndexedDB reuses the existing generic workspace adapter behind its legacy inventoryStorage name. Native compatibility is bridge 9; a future APK update is necessary. Automatic sending and manual requests share journal/guard state. Device stores remain independent: do not enable automation on multiple devices expecting shared exactly-once history.

New source areas: src/core/review-requests, src/adapters/amazon-reviews, src/features/review-requests. Shared integration touches App, Settings, order rows/adapters/cache, device storage allowlists, AmazonSession/DeviceBridge, local server/worker and relay.

No unit/browser/device tests, typechecks/builds/APK commands, live eligibility checks or customer submissions were run for this implementation. Generic replacement/due/uncertainty regression sources were authored only. Auto-sending has not been activated and no configuration/data has been changed in private storage.

Later acceptance must check the compiled Java/TS integration, 201 semantics, concurrent send claims, crash/timeout before/after dispatch, replacement metadata availability, unknown Seller Central history, no requests on excluded chains, old-native compatibility and profile switching. Do not send live customer requests merely to validate a build. Keep docs/INTEGRATION_READY.md closed until owner authorises compilation/verification.

Antigravity owns ONLY the separate new return-recovery folders. Returns/cost recovery is not integrated yet; existing automatic refund COGS behaviour is not changed by this feature.
