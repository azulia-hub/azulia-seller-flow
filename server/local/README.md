# Local connection and automatic report delivery

## Amazon Ads (separate from the seller API)

After approving an LWA Ads application, authorize it and save the returned
`client_id` and `refresh_token` in an owner-only `tokens.json`. This file is
Git-ignored. Run the following with your verified India profile and seller IDs:

```sh
npm run ads:setup -- --tokens tokens.json --profile YOUR_ADS_PROFILE_ID --seller YOUR_SELLER_ID
```

Enter the matching Ads client secret at the hidden prompt. Setup writes only
`~/.config/azulia/amazon-ads-credentials.json` (directory 700, file 600), or
`AZULIA_ADS_CREDENTIALS_FILE` if explicitly configured. The Ads service reloads
credentials without requiring another restart. Existing SP-API credentials are
not changed. A private `.local/amazon-ads-credentials.json` is a fallback for
initial setup; access-only credentials cannot renew expired access tokens.

After installing the source update, build and restart the local backend. Open
Advertising or Settings for profile/coverage/status and refresh controls. The
service starts with 30 days of Sponsored Products advertised-product reports,
requests selected dates within Amazon's last 95 days in 31-day windows, and
refreshes recent eight days hourly while the backend is running. Report jobs,
provider cooldowns and prior observations resume from `.local/ads-cache/`.
Failures retain the latest successful report. Ads reports use seven-day click
attribution and spend before GST; financial booked expenses are unchanged.

Uploading a workbook disables API report presentation; re-enable “Use connected
advertising reports” to switch back. API delivery does not overwrite the saved
workbook. No campaigns, bids or budgets are changed. Desktop connection does not
transfer credentials or reports to the independently stored Android app.

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

### Repositories on NTFS drives

The credentials loader prefers `AZULIA_CREDENTIALS_FILE` when explicitly set,
then an existing `~/.config/azulia/amazon-credentials.json`, then the legacy
repository `.local/amazon-credentials.json`. Setup updates the same selected file.
All locations still require a regular, non-symlink file with owner-only permissions.
If the project drive reports every file as mode 777 and ignores chmod, keep the
credential file on a Linux filesystem (directory 700, file 600). Existing cached
reports remain in the project directory; credentials do not need to be re-entered.
