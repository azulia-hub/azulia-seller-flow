# Privacy and calculation notice

Azulia Seller Flow is local-first. Imported reports, product costs, classification rules, and saved report history are processed and stored in the user's browser. They are not intentionally sent to an application server by this static build.

Browser storage is not a permanent backup. Users should download a backup from **Data & Settings** and protect it like any other business-financial file.

Analytics are estimates derived from imported source data, classification rules, selected filters, and product costs. Profit is incomplete when costs or source classifications are incomplete. Settlement transfers are disclosed separately and excluded from operating profit. Users should reconcile important financial decisions against marketplace statements and professional accounting records.

## Optional local automatic delivery

When running `npm run local` with configured Amazon credentials, the local backend fetches financial activity directly from Amazon and caches it in a private SQLite file under `.local/activity-cache/` on this computer. It continues while the backend runs, even when the browser is closed. Credentials remain in the existing private local credential file; tokens are never sent to the browser. The browser keeps the last normalized automatic reading in its existing local import store. Neither this cache nor manual reports are uploaded to a third-party analytics/cloud service. Manual upload remains a separate fallback; advertising workbooks retain their existing upload flow. Stopping the local process or turning off the computer stops syncing.

## Optional hosted Netlify relay

When deployed with the hosted delivery flag, the website sends explicitly requested Amazon API calls through a Netlify Function. Your own Amazon credentials are transmitted over HTTPS for authorization, and the caller-owned access token is returned to your page's temporary memory. Netlify necessarily processes those requests in transit. Application code does not persist credentials, tokens or seller records on Netlify or log their contents; this does not promise that hosting providers keep no operational request metadata.

Raw source records, their old versions, order metadata, sync coverage/page checkpoints and calculated readings stay in IndexedDB on this device. Only a non-secret account fingerprint and view selection are saved in web storage. Refreshing/closing the page or choosing Forget session removes the app's in-memory authorization. No background cloud sync runs after the page closes. Each device/browser/origin has a separate cache; existing localhost records are not automatically uploaded to the hosted site. See `NETLIFY_SETUP.md` for limits, backups, source coverage and setup.
