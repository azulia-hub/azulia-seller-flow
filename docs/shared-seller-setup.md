# Shared seller workspace (ADR-075; supersedes ADR-074 provider setup)

## Current owner setup checkpoint

The owner approved Netlify access, and the three production settings are now
configured in the existing `friendly-begonia-8ae3e2` project. A private API
read-back confirmed matching values and availability to Functions. Free-plan
standard private environment variables/default scopes are used; no plan upgrade
or paid secret-hiding feature was enabled. Generated login/recovery material is
saved locally at `.local/shared-owner-setup.json` with mode 600 and is ignored
by Git. Open that file privately to obtain the generated app password. Do not
copy it into chat or a repository. Owner-authorized builds (default and Netlify
shared mode) and backend TypeScript checks passed on 2026-11-12. Application
test suites, push, deployment, database provisioning and migration execution
have not run. The new source still
needs an authorized deployment before the shared workspace can be used.

Builds/typechecks are complete; runtime tests, live Amazon/database checks,
cloud provisioning, restart, push and deployment remain deferred. Existing
deployments do not automatically acquire this implementation.

## What is shared

Native Netlify Database (Postgres) holds one owner workspace: raw financial
transactions, order summaries/items, catalog titles/image URLs, previous source
versions, coverage, page tokens, rate cooldowns, a writer lease, product costs,
classification rules, and versioned normalized/dashboard results. Netlify
Functions run the authenticated backend. There is no SQLite file inside a
function and no Supabase account, API key or Auth dependency.

The official `@netlify/database` driver is pinned in package.json/package-lock.json
and hidden behind `server/shared/database.ts`. It selects Netlify's current
production or preview database branch. There is no duplicate driver or ORM in
application code. Fixed SQL statements use positional parameters. Deploy
migrations live in `netlify/database/migrations/` and are applied by Netlify before
publishing the deploy. No database connection is needed at Vite build time.

This first deployment supports your personal owner workspace, not public signup.
Choose an app email/password during the server setup below. This is a separate
app password; do not reuse or enter your Netlify/Amazon login password. Successful
login creates the owner row automatically. Another device uses the same app
login and reads the same owner ID and dataset. Auth is isolated behind an
interface so managed multi-user registration can be added separately later.

Passwords are verified using Node's scrypt against a server environment hash;
no plaintext password is stored in Netlify Database. The protected local recovery
file contains the generated app password for the owner. Random access/refresh sessions are stored only
as SHA-256 hashes in Postgres. Access expires after 15 minutes, with refresh up to
an absolute 12-hour lifetime. Changing the configured password hash revokes old
sessions on their next request. Successful online sign-out deletes that session.
Failed sign-ins are throttled in the database, including across function
instances. Trusted client IP comes from Netlify's function context, never JSON.

The backend authenticates every data request before deriving its owner ID.
Application tables have RLS enabled and PUBLIC privileges revoked. The backend
uses the database owner's connection, so every query is explicitly scoped to the
verified owner; no browser database connection or public database REST API is
provided. Amazon credentials use AES-256-GCM with owner ID as authenticated
context, using a server environment key. Never prefix server keys or hashes
with `VITE_`.

Browser sessionStorage holds only the workspace access/refresh session.
IndexedDB holds the last normalized reading for display. The authoritative
source remains in Postgres. Filters and temporary cost previews can deliberately
differ across devices; the underlying account source and saved settings do not.

## Activate when verification/deployment is authorized

Use your existing Netlify account and existing Azulia project. No extra database
provider account is required. There are three required **server environment**
variables available to the Functions runtime in your production deploy. On a
Free plan, keep Netlify's default **all scopes**; selecting Functions-only scopes
requires an upgrade. Standard project environment variables work without that
upgrade. They must keep the exact `AZULIA_` names below, never `VITE_` names:

| Variable | Value |
| --- | --- |
| `AZULIA_OWNER_EMAIL` | The email you choose for the app's owner workspace |
| `AZULIA_OWNER_PASSWORD_HASH` | A scrypt hash generated privately as below |
| `AZULIA_CREDENTIAL_KEY` | 32 random bytes encoded as 64 hex characters |

Choose an app password of at least 12 characters. In Bash, from this repository,
generate its hash without putting the password in shell history, arguments, or
an environment variable:

```bash
read -r -s -p 'Choose workspace password (12+ characters): ' azulia_workspace_password
printf '\n'
printf '%s' "$azulia_workspace_password" | npm run --silent shared:password
unset azulia_workspace_password
```

Copy only the resulting line beginning `scrypt-v1$` into Netlify's
`AZULIA_OWNER_PASSWORD_HASH`. Do not paste either the password or hash into chat.
The helper has been authored but **not executed** during implementation.

Generate the Amazon credential encryption key privately:

```bash
openssl rand -hex 32
```

Save it securely and put it in `AZULIA_CREDENTIAL_KEY`. Losing/changing the key
requires reconnecting Amazon. The configured owner email is the workspace
identity: changing the email creates a different empty workspace; changing only
the password hash keeps the data and expires existing login sessions.

Then, when authorized:

1. Run the deferred verification and review the prepared migration.
2. Deploy the frontend, functions and migration together. `netlify.toml` already
   selects shared mode. With the official integration and migrations present,
   Netlify provisions the database and applies migrations as part of deployment.
   Alternatively, the project dashboard offers **Data & Storage → Database →
   Create a database manually**. No Supabase SQL-editor step is needed.
3. Do not manually replace `NETLIFY_DB_URL`: Netlify manages the correct branch
   connection. Do not expose it in a public frontend variable.
4. Open your production site, sign in with the app owner email/password you
   configured, connect Amazon once, and request your date range.
5. On mobile, open that same production URL and use the same app login. A deploy
   preview has a separate database branch; it is not the production dataset.

The database can provision automatically on a properly prepared deployment,
but pushing alone does **not** set your three private environment variables.
No push, deploy, migration application or provisioning was performed here.

## Local UI using the same production dataset

Add the exact extra frontend origin to your Netlify server environment:

```text
AZULIA_ALLOWED_ORIGINS=http://127.0.0.1:8788
```

This is optional for the hosted site, which already permits its own origin.
For the local UI to use your deployed shared backend:

```bash
export VITE_AZULIA_SHARED_ENDPOINT=https://YOUR_SITE.netlify.app/.netlify/functions/shared
npm run local:shared
```

This command builds and starts the UI at port 8788, without the legacy local
Amazon/SQLite sync. It has **not** been run. Do not launch it until builds are
authorized. `npm run local` remains the independent legacy mode. Avoid running
both launchers on port 8788 simultaneously. A local Netlify dev database is a
separate development dataset, not your mobile/production data.

## Existing data and migration

No existing SQLite files, IndexedDB stores, uploaded reports, or local costs are
deleted or silently uploaded. Export a backup from the legacy app first. In
shared mode, restoring that backup imports its costs/classification rules into
the authenticated workspace; it does not mark old source coverage as verified.
Reports remain a manual fallback. Amazon source data is fetched into the new
shared account on first sync. Old caches can be retained for comparison.

A workspace is bound to its initial Amazon client/refresh-token authorization.
Connecting a different authorization is rejected to prevent mixing sellers.
Credential rotation that changes that authorization requires an explicit future
seller-identity migration; changing the client secret alone is supported.

## Reading and sync behavior

One account writer holds a renewable two-minute database lease. Other devices
read its saved updates. Each source page, continuation token and coverage update
commits in one Postgres transaction with compare-and-swap conflict detection.
Only changed source content increments the source revision. Multi-page items are
published only after their final page. Unknown source fields remain in the raw
database; unknown financial classes stay visible in existing quality views.

The server normalizes one versioned dataset and caches selected dashboard
results by source revision, shared settings revision, engine, dates, fulfillment
and marketplace day. Browser refresh revalidates metadata; a newer revision is
published without replacing the page with a loading skeleton. The order popup
uses the current period object so new catalog details can appear while open.

Order-value cards use recorded INR Orders `OrderTotal`. They do not switch to
Finance amounts, multiply line totals by quantity, or estimate a missing pending
price from historical sales. Missing totals are explicitly marked. This is an
order-value metric; it is not a claim of exact instantaneous equivalence with
Seller Central's separately defined sales metric. Finance/profit uses recorded
charges/refunds/reimbursements, including deferred activity, attributed to the
verified original purchase date. Missing purchase dates are not replaced by
posting dates. Missing product costs default to `BLOCK` in the new workspace.

`OrderTotal` and item-line prices are deliberately kept separate: item-line price
excludes shipping/gift wrap and cannot silently replace a missing order total.

Manual Sync now refreshes selected linked histories without the legacy six-hour
gate. Source history is never cleared by the shared Refresh action. Failed jobs
retain their checkpoint for retry rather than falsely completing coverage.
Amazon throttling still applies; completion of an old backfill can take time.

Sync is driven by an open browser. Closing every browser pauses new requests;
the saved data and jobs remain on the server. Another signed-in device can resume
after the previous lease expires. This change does not add a scheduled worker,
Amazon Notifications subscription, or a promise of sync while every device is
closed. An offline device necessarily shows its last reading until connected.

No automatic retention/deletion job is enabled. Database size depends on seller
volume and retained source revisions; storage is not unlimited. Responses have an
explicit 18 MiB cap and preserve the prior reading if exceeded. Large-account
windowed/paged reading delivery remains a follow-up before scaling beyond this
initial personal workspace. Provider quotas, Amazon delays, permissions and
deploying different frontend engine versions still require visible handling;
no design can guarantee that such failures never occur.

References: [Netlify Database setup](https://docs.netlify.com/build/data-and-storage/netlify-database/getting-started/),
[Netlify Database migrations](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/),
[Netlify Database API](https://docs.netlify.com/build/data-and-storage/netlify-database/api/),
[Amazon Orders model](https://github.com/amzn/selling-partner-api-models/blob/main/models/orders-api-model/ordersV0.json).
