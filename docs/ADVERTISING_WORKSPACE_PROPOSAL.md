# Advertising workspace proposal

Status: read-only workspace implementation approved on 2026-11-19. Work is split
between Codex (domain/data/integration) and Antigravity (isolated UI), according to
docs/ADVERTISING_PARALLEL_HANDOFF.md. Campaign/bid mutations and changes to existing
financial accounting policies are not approved by this document.

## Purpose

Help the seller answer four questions in sequence:

1. What changed in advertising performance?
2. Where should I investigate first, and how much spend is involved?
3. Which campaign, product, target or customer search explains the result?
4. What evidence supports the next action?

The current page leads with connection/setup details, a collection of account metrics,
and a reused product table. Its information hierarchy should instead lead with
performance and evidence. Move credential/profile IDs, setup commands and detailed
sync diagnostics into Settings. Keep a compact freshness/coverage indicator on the
advertising page, expanding into diagnostics only when requested or when an issue
affects interpretation. Existing core financial policies remain authoritative.

## Page shell

One Advertising workspace with a shared header:

- Advertiser name and marketplace.
- Selected date range and a same-length comparison range.
- Active ad-product scope, initially Sponsored Products only.
- Small freshness and coverage control, such as “Updated 10:20 · Through yesterday”.
- Filters appropriate to the active perspective; preserve them in the URL/view state.

Use four seller-facing tabs: Overview, Campaigns, Products and Search terms. Search
terms becomes available when its adapter/view ships. Future capabilities appear
when their data and UI are implemented; avoid permanent empty tabs. Targeting,
placements and budget analysis can join through additional registered views or a
compact More menu when needed. These are views of one workspace, not separate
dashboards each fetching and recalculating its own numbers.

Filters have explicit scope. Campaign, product and date selections carry through
supported views. An unsupported combination remains visible with an explanation;
do not silently ignore it, broaden it, or divide filtered spend by account-wide sales.
For example, campaign-level TACOS requires defensible campaign-wide total sales,
which an Ads attribution report alone cannot provide; show it unavailable there.

## Overview

Order of content:

1. Compact context/freshness and shared filters.
2. Five primary measures: reported ad spend, ad-attributed sales, ACOS, ROAS and
   TACOS. Label scope/tax/attribution once near the measures and keep definitions
   accessible. Show comparison changes only with complete comparable coverage.
3. A small ranked “Needs review” section with at most three initial findings.
4. One trend area, letting the user choose spend/sales, efficiency or traffic.
   Use aligned panels or clearly labeled scales when units differ.
5. A short campaign performance table with a route to the complete Campaigns view.

Clicks, impressions, CPC, CTR, purchases, units and conversion rate remain available
in secondary detail/columns. Each measure can open its definition, source, window
and a ranked breakdown. Do not add a large permanent grid of every possible metric.

Each review finding includes entity, evidence, magnitude, compared periods,
observation cutoff and a View evidence action. Examples: spend with no attributed
purchases, ACOS increasing with enough comparable data, or a product's supported
contribution turning negative. The first examples are performance signals, not
proof of wasted money. Recent conversion attribution and small samples must be
explicit. Review rules are deterministic, configurable pure functions. Any proposal
to change existing ADR-061/063 thresholds or loss requirements needs its own decision.

## Campaigns

Default table: campaign, spend, attributed sales, purchases, ACOS, ROAS, change and
reason for review. Display enabled/paused status and budget only after fetching
authoritative entity metadata; daily advertised-product rows alone do not supply
the complete campaign inventory or current status.

Open a campaign detail page with its summary, trend, ad groups, advertised products
and search terms. Preserve filters and scroll on Back. Its detail navigation must
not place search-term and product observations into a presumed one-to-one hierarchy.

## Products

Default table: product/SKU, reported spend, total product sales, attributed sales,
TACOS, ROAS and supported profit after reported ads. Use the existing product page
and cost safeguards. Distinguish financial total sales from Ads-attributed sales.

Product results require the existing verified SKU join and relevant financial date
basis. Keep unmatched SKU/ASIN spend visible as a counted review issue. Do not guess
profit, SKU attribution, or organic sales from an unsupported join. Product
contribution retains the existing before-GST Ads spend and financial accounting
policy; it is not automatically final net profit.

## Search terms

Default table: customer search term, campaign/ad group, target and match type when
reported, clicks, spend, purchases, attributed sales, ACOS and ROAS. Additional
columns include impressions, CTR, CPC and conversion rate. Clearly distinguish the
customer's search term from the advertiser's keyword or targeting expression.

Useful saved filters include no-purchase spend and converting terms. The rule
criteria must include a configurable sample/observation requirement and conversion
lag; do not label every no-sale click as waste. Selecting a term opens its daily
trend and all campaign/target occurrences. An account-wide term total must keep
the underlying occurrences explorable.

The search-term report is click-qualified and is not a complete account traffic
baseline. Join product identity only when the selected source grain establishes
it. A campaign advertising multiple products does not establish per-SKU search-term
spend or profit. Keep unsupported product filters unavailable with an explanation.

Future recommendations can offer a reviewable negative-keyword or exact-match
proposal when supported by evidence. Keep the proposal and its evidence separate
from any eventual campaign mutation, which requires an explicit action flow and
durable attempt/result history. No automatic changes are part of this design phase.

## Product investigation and family/custom-group scopes

Owner clarification: investigate a single SKU's campaigns, targeting/bids and search
terms, and evaluate parent variants/custom related-SKU groups together because an
advertised child can drive a sibling purchase. Support both through one reusable
product scope: individual product, verified catalog family, or saved custom group.
Display the member list and group-definition version, persist groups outside the
analytics core, and resolve marketplace parent relationships in source adapters.
If catalog relationships are unavailable, allow explicit manual membership; do not
infer parentage from SKU names. Preserve consistent membership for comparisons or
explain a membership change. Deduplicate overlapping groups when aggregating a
larger scope; do not sum overlapping group totals.

Opening a product/group uses the existing product workspace with Summary,
Campaigns, Targets & bids, Search terms and Cross-sales perspectives. All receive
the same member set, dates and metric/coverage contracts. Related campaigns and ad
groups come from explicit advertised-product mappings. Current campaign/ad/target
status and configured bids require authoritative entity metadata, separately from
performance reports. Distinguish target bid, inherited ad-group default bid and
placement/bidding adjustments; current configuration is not historical bid evidence.

Search terms and targets can be scoped to a product/group only if their report grain
or validated entity membership establishes that connection. An ad group containing
multiple products does not establish per-product keyword spend. Such results remain
visibly shared at ad-group level; never proportionally allocate or repeat their full
spend into each child. If every eligible product in an ad group belongs to a selected
family, a family-level view may be supported, subject to matching reporting dates
and historical membership evidence.

Separate converting customer searches from explicit active keyword targets. A term
without an active exact-match keyword can still receive bids through broad/phrase,
automatic or product targeting. Only say “No active exact-match target” after
checking authoritative target/negative/status coverage; “not bidding” would be an
unsupported generalization.

Preserve two attribution identities: advertised/traffic-driving product and purchased
product. A cross-sale view should present an attributed flow from advertised SKU/ASIN
to purchased SKU/ASIN, with a nonzero/missing/unknown distinction. This is aggregate
Amazon attribution, not a customer-level clickstream or proof of incremental sales.
The existing advertised-product total attributed sales already includes same-SKU and
other-SKU sales; normal ACOS must continue using that total. Other-SKU sales alone
do not identify the purchased sibling or establish parent membership. Purchased-
product reporting is an additional required source for identifiable cross-product
flows, subject to actual schema, grain, attribution-window and completeness validation.
Match purchased ASINs to seller SKUs conservatively; ambiguous mappings stay visible.

Group measures sum base observations once, then recompute ratios:

- Ad-driving group spend: spend on ads promoting group members.
- Ad-driving attributed sales: total sales credited to those ads, including sales
  of products outside the group. Group ACOS = summed spend / summed attributed sales.
- Within-family attributed sales: same-product sales plus verified sibling purchases
  originating from the group's ads. This requires compatible purchased-product
  evidence; do not add the purchased-product report on top of already counted total
  attributed sales. Show an explicitly labeled within-family cost ratio if complete.
- Cross-family sales out and sales received from ads on products outside the family
  are separate perspectives, not extra sales to add into the same ACOS denominator.
- Group TACOS: group ad spend / compatible financial product revenue for member SKUs.
  Preserve existing tax/date-basis and missing-cost policies.

Never average child ACOS, ROAS, CTR, CPC or conversion-rate percentages. Recompute
each from its summed numerator/denominator. Distinct orders are not necessarily
additive across product purchases; require source order identity or label summed
purchase counts as source-reported attributed purchases.

Avoid penalizing a traffic-driving child on same-SKU conversion alone. Show its own
sales, verified sibling sales, other/unknown cross-sales and total credited sales
together. A receiving child shows its financial sales separately from advertising
credit earned by a different advertised child. Group effectiveness does not justify
inventing a new spend allocation or campaign/search-term profitability.

## Metric contracts and correctness

Every result should carry:

- Advertiser, marketplace, currency and reporting timezone.
- Report/source type and declared grain.
- Selected filters, covered dates, latest observation and source revisions.
- Attribution model/window and whether sales are click-attributed or financial.
- Tax treatment, financial date basis and eligibility/completeness status.
- IDs of the observations supporting the value or finding.

ACOS = reported ad spend / attributed sales. ROAS = attributed sales / reported ad
spend. TACOS = reported ad spend / compatible total product sales. Preserve the
current Advertising-view convention: reported spend excludes GST, and the financial
denominator uses product revenue excluding separately reported GST, before refunds.
The main financial Gross sales display has a different contract and may include
customer tax/shipping/gift-wrap revenue; never substitute it by a shared display
label. A missing/zero denominator is unavailable, not automatically a zero result.

Initially label account scope as Sponsored Products; do not imply all-ad-product
TACOS until all active ad products are covered. Customer-tax snapshot preferences
must not silently change the Ads metric definition. Comparison deltas for percentages
use percentage points where appropriate, and ratios are recomputed from summed
numerators/denominators, never averaged row percentages.

## Data and implementation architecture

Preserve the repository's DATA + SPECIFICATION = RESULT pattern:

```text
Ads profile + supported report specification
    -> fetch jobs / poll / bounded download / raw observations
    -> report-specific adapters and validation
    -> typed datasets with explicit grain and coverage
    -> shared declarative queries and metric selectors
    -> evidence-based insight rules
    -> page/table/chart specifications
    -> responsive React views
```

Transport/security remains in local/native adapters. Core stays pure TypeScript
and generic; UI components build specifications and render returned results.
Shared parsing/query/rules serve desktop and Android; only credentials, transport
and persistence differ. Native Sponsored Products transport is implemented in
0.2.12 (ADR-088); additional report kinds need matching native transport support.

Data sets include advertised-product performance, search-term performance, future
campaign/target/placement observations and authoritative entity metadata. Keep
financial sales/COGS inputs separate and joined through explicit identity/date
specifications. Preserve original fields, unknown values and raw observations.

Critical rule: advertised-product, search-term and campaign reports are alternative
breakdowns of overlapping activity. NEVER add their spend together. A report-source
resolver chooses one authoritative dataset per metric/scope and makes differences
and coverage visible. Cross-report reconciliation is a diagnostic, not an adjustment
that silently rescales one source to another.

Persist by advertiser/profile + marketplace + report kind + attribution contract +
report configuration version + date window. Use source IDs and full declared grain
for upserts; campaign names, target text and search-term text alone are insufficient
keys. A completed window replaces its prior observation, including zero-activity
days; uncompleted or invalid windows retain prior results and never mark coverage.

Extend existing request pacing/cooldowns, job persistence, signed-download bounds,
account isolation and recent-conversion refresh. Refresh policy should acknowledge
that seven-day click attribution can revise recent dates and that Amazon can make
later corrections. Do not promise immutable daily results or complete older changes.
Do expensive normalization and broad queries in the existing worker path, and
virtualize/page long tables. Metadata/freshness-only updates should not recompute
every table or replace unchanged report references.

A small local capability registry is sufficient: each view declares required data,
supported filters, query specifications, default columns, insight rules and drilldown
routes. Add report adapters and view modules rather than conditionals throughout a
large App.tsx. Do not create a runtime plugin system or speculative dependency layer.

Suggested ownership (names are illustrative, not mandates to duplicate modules):

```text
adapters/amazon-ads/      report specs, source parsing, entity identities
adapters/device/         local/native Ads transport and durable storage
core/analytics/          shared metric/query selectors
core/insights/           generic evidence-based review rules
features/advertising/    shell, view definitions, tables, detail routes
app/                    shared selection and workflow orchestration
```

## Mobile and visual direction

Keep Azulia's ivory/charcoal/gold identity. Use restrained borders, consistent
spacing, tabular numeric alignment and generous whitespace. Reserve semantic colors
for meaningful direction; an increase in spend alone is neither good nor bad.

On mobile, put context/date controls first, use two-column summary measures, put
urgent findings before charts, and use compact entity cards with a detail route.
Keep full comparable data available; a table can expose extra columns through
explicit controls. No hover-only evidence or desktop-only actions. Back preserves
filters, scroll and selections on both platforms.

## Delivery sequence

1. Restructure Overview/Campaigns/Products using current trusted data; move setup
   details into Settings. Keep existing calculations and evidence routes.
2. Add search-term source specification, persistent storage, parsing, coverage and
   a Search terms view. Verify totals/source grain before introducing recommendations.
3. Add tested review findings with visible criteria, comparison coverage and lag.
4. Add authoritative targets/placements/budget metadata and optional saved views.
5. Add explicitly approved campaign-action workflows as a separate capability.

Acceptance: every headline can be explained from source evidence; report kinds
never duplicate spend; filters do not silently broaden; financial/Ads tax and date
bases stay explicit; incomplete data does not create confident recommendations;
desktop and mobile expose the same investigative flow. The conversation preview
uses illustrative values and is not a live report or an implemented app change.
