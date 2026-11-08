# Local connection and automatic report delivery

Use Node 22.18+ (Node 24 recommended):

```sh
npm run local
```

Open http://127.0.0.1:8788/. Existing credentials are reused. `/auth/local` checks the connection; `npm run local:setup` is only needed if credentials need changing. Stop an existing launcher with Ctrl+C before restarting it.

The backend now starts a periodic financial-activity coordinator independently of the browser. It continues while this process runs, even after all browser tabs close. Stopping the terminal process, computer shutdown or unavailable network prevents fetching; checkpoints resume on restart. No OS startup service, cloud account or new runtime package is installed.

## Data flow

- With no automatic cache, fetch the most recent 30 calendar days in bounded paginated windows.
- Completed date windows establish coverage. Selecting earlier dates queues only uncovered intervals.
- Every 15 minutes, revisit a short recent overlap for new/delayed records. Older unresolved order references are checked every six hours when history work is idle.
- Upsert by Amazon transaction ID, retain changed prior observations and sort by posting time plus ID.
- Adapt cached records to the existing Unified Transaction columns, then use the original normalizer/calculations. Unknown components and unallocated differences stay visible; report totals must reconcile.
- The browser restores its last saved automatic reading and polls the local source revision. After the first reading, only changed source IDs are transferred from the backend and merged into the browser cache. A changed revision is normalized in a worker and replaces the current dataset without a page reload, resetting neither costs nor selected dates.
- Manual report upload and advertising workbook upload remain available. ID-less manual CSV rows are never blindly merged into API records.

Amazon's Finances API is not an exact export of Seller Central's Unified CSV. Some portal-only fields are unavailable; unknown money, absent location and unsupported fulfillment detail are not invented. Financial events can lag by 48 hours. The API provides posting-date filters and order-reference lookup, not a universal changed-since stream: updates outside refreshed windows or unresolved-order checks are not guaranteed. This is not a live ordered-sales feed. No whole-history report is downloaded on every visit.

## Local persistence and security

Built-in `node:sqlite` stores account-partitioned source records, changed versions, rejected-source audit text, history coverage and pagination checkpoints under `.local/activity-cache/`. SQLite is a local cache, not a cloud service. No new dependency is installed. The directory is private (700); databases are private (600). Credentials stay in the existing separate `.local/amazon-credentials.json`. They and all cache files remain Git-ignored. Tokens never reach the browser.

Loopback-only hosting, exact Host/Origin checks and explicit mutation intent remain in place. Local APIs expose sync status, cached source data and bounded history requests; callers cannot supply arbitrary Amazon URLs or tokens. A changed credential fingerprint selects a separate cache. Browser readings are saved under a stable per-account import ID and preserve the original manual report history.

Implementation is unverified: tests, builds, browser/mobile checks and live Amazon requests were not executed during this work, per owner instruction.
