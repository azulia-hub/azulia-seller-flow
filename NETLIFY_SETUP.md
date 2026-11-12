# Netlify setup — on-demand Amazon relay

This deployment serves the website and a small stateless Netlify Function. Amazon records, coverage, old source versions, order metadata, pagination checkpoints and calculated readings are saved on the user's device. There is no Netlify database, Blob/KV storage, scheduled function or background job. Requests and their credentials necessarily pass through Netlify and Amazon in transit; application code does not persist or log them. Hosting providers can retain normal operational request metadata.

## Current readiness

Implementation is prepared in source. Tests, typecheck/build, browser/mobile checks, live Amazon requests and deployment have **not** been executed for this change, by owner instruction. No branch was committed/pushed or Netlify project published by the agent. The Netlify project must deploy a revision containing these files; deploying the previously selected `main` revision alone will not include local, uncommitted work.

## Project settings

Import the repository into the existing Netlify Free account. The checked-in `netlify.toml` configures:

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- Node version: `22`
- Non-secret build flag: `VITE_AZULIA_DELIVERY=netlify`

No Amazon environment variables or Netlify database are required. Do not upload `.local`, `.env*`, private reports, browser backups or credentials. `.netlify/` linking metadata is ignored. The website uses Netlify's HTTPS hostname; no custom domain or local tunnel is required.

Publishing/deploying requires a repository revision containing the implementation and explicit owner authorization. Validation commands, when authorized, are `npm run typecheck`, relevant Vitest cases, and `npx playwright test --config playwright.hosted.config.ts`. The hosted browser config uses a separate Vite port and the hosted flag; its relay responses are fixtures, not real Amazon calls. Production builds should be made with the hosted flag supplied by `netlify.toml`/the environment. Existing `npm run local` remains the separate local-backend mode when that flag is unset.

## Using the hosted app

1. Open the deployed HTTPS URL on desktop or mobile.
2. Choose **Enter credentials**. Enter your own LWA client ID, LWA client secret and SP-API **refresh token** for the Amazon India account. Connecting checks token exchange, not every API permission.
3. The form clears on submission. Credentials and the resulting access token stay only in that page's memory; they are not put in localStorage, sessionStorage, IndexedDB or Netlify configuration. A browser/password manager may have its own autofill policies, outside the app's control.
4. Choose an initial date range and press **Sync now**. This explicit action drives bounded, rate-paced pages, purchase-date verification, necessary linked financial history and available Catalog details. It does not run a timer that periodically contacts Amazon after completion.
5. Existing source records are merged by ID; only changed content publishes a data revision. The existing calculation worker updates the current dashboard quietly. Orders use verified purchase dates and all recorded activity, including deferred entries. No order total is fabricated into financial product sales.
6. **Stop sync** aborts the active request and retains completed pages. Press **Sync now** with the same dates to resume. Page tokens older than 23 hours restart their unfinished window safely with ID upserts. Completed history is retained; explicit refresh revisits only a bounded overlap and due linked records, rather than replaying the entire saved history.
7. Refreshing or closing the page forgets credentials and stops new relay calls. Reopening restores cached results without Amazon access. Reconnect and press Sync to fetch more data. Forget session explicitly clears in-memory authorization while retaining cached results.

Each device/browser/origin has its own data and cost/settings cache. The existing localhost cache does not automatically transfer to the Netlify hostname or to a phone. Clearing website storage removes the cache. Retain an appropriate private backup; the hosted source-cache checkpoint store is separate from legacy report backup files.

## Source coverage and limits

- Amazon API throttling applies. Finance/history, Orders lists, individual Orders and Catalog calls have separate paced allowances; cooldown checkpoints survive Stop/Resume. HTTP 429 delays only the active user-requested sync.
- The browser uses a renewable two-minute IndexedDB lease to avoid concurrent sync writers for the same account. After a tab/device kills the page abruptly, a new tab may need to wait for that lease to expire.
- User-requested date windows are split into bounded pages. Coverage advances only after terminal pages. Interruptions and source/schema/currency errors retain checkpoints and the last completed result.
- Old purchase periods can require linked per-order financial reads for later refunds/charges. Those first-time histories can take longer than downloading current activity. There is no universal changed-since cursor; arbitrary historical edits outside selected ranges/overlaps/revisits are not guaranteed.
- Financial events may be delayed by Amazon. A successful sync does not prove the marketplace has supplied every future financial entry.
- Catalog 403 is displayed separately. Finance and Orders continue; actual product photos require the relevant Amazon permissions.
- Finance source fields and unknown amounts remain preserved. Unsupported order metadata is quarantined as minimal source evidence, with purchase dates left unknown; no buyer/address fields from Orders responses are relayed to the browser.
- The relay accepts only bounded same-origin POSTs to fixed India/EU Amazon operations. It does not accept arbitrary URLs, caller-selected upstream hosts or Amazon credentials in query strings. Responses are streamed with explicit no-store headers and a bounded size.
- Browser calculations and Netlify relay/source requests are still subject to browser storage, network, hosting usage and execution limits. The free plan is not unlimited.

References: [Netlify Functions](https://docs.netlify.com/build/functions/get-started/), [function limits](https://docs.netlify.com/build/functions/configuration/), [function API and rate limits](https://docs.netlify.com/build/functions/api/).
