# Advertising redesign: Codex + Antigravity ownership contract

Owner approved implementation and this work split on 2026-11-19. The detailed
design is docs/ADVERTISING_WORKSPACE_PROPOSAL.md. That document's earlier
“proposal only” status is superseded for the read-only advertising workspace,
product/group investigations and supporting report integrations. Campaign/bid
mutations remain outside scope.

## Codex ownership

Codex owns the shared domain/types/contracts, all calculations and insight rules,
source specifications/parsers, real API calls, coverage/source reconciliation,
product/catalog/parent identity, SKU-group validation/persistence, desktop/native
storage, background processing, credential handling, all integration into App.tsx,
existing product pages and Settings, native bridge/APK/release work, primary project
documentation and integration validation.

Reserved paths include all existing files unless explicitly listed under
Antigravity ownership below. In particular Antigravity must not edit core/,
adapters/, server/, android/, src/app/, package files, public/device-bridge.json,
existing styles/components, or src/features/advertising-workspace/contract.ts.

The contract is now present and ready for UI work:

- src/features/advertising-workspace/contract.ts: `AdvertisingWorkspaceViewProps`
  and all presentation model types.
- src/core/advertising/workspace.ts: shared generic metrics, product/group scopes
  and versioned group definitions. Import its types through the contract.

Codex's next integration stages: bridge existing Sponsored Products data into the
model, add persistent source/coverage support for search terms and purchased-product
evidence, add authoritative target/bid metadata, wire group scopes and verified
financial joins, then integrate the UI. Report availability and desktop/Android
support must remain explicit. Do not claim those sources exist merely because
their presentation types are defined.

## Antigravity ownership — new UI files only

Create files only under:

1. src/features/advertising-workspace/ui/**
2. tests/fixtures/advertisingWorkspace* (new isolated fixture files)
3. tests/e2e/advertising-workspace-ui.spec.ts
4. docs/ADVERTISING_UI_RESULT.md

Required entry point:

```tsx
// src/features/advertising-workspace/ui/AdvertisingWorkspaceView.tsx
export function AdvertisingWorkspaceView(props: AdvertisingWorkspaceViewProps) { /* ... */ }
```

Use `../contract` as the type contract. Codex will connect this entry point to the
real app; do not change App.tsx or route definitions. Read existing components and
theme tokens to reuse them, but do not edit them. Keep all new CSS under ui/ with
an `adsw-` prefix or equivalent root scoping. Preserve ivory/charcoal/gold branding,
light/dark themes, existing app shell and reduced-motion preferences. Do not add
another whole-app navigation/header/footer.

## UI deliverables

- Overview, Campaigns, Products and Search terms views. Render only the views in
  model.availableViews; future sections must not appear as fake populated tabs.
- Shared date/context/scope controls: account, individual product or saved group.
  Pass specification patches to onQueryChange; the model is the source of truth.
- Five primary summary measures, coverage/freshness, up to three supplied review
  findings, trend presentation and table/entity navigation. Secondary metrics
  remain accessible without a permanent wall of cards.
- Campaign/product/group/search-term details, using model.detail and its declared
  availableSections. Support Summary, Campaigns, Products, Search terms, Targets &
  bids and Cross-sales when supplied. Use onOpenEntity/onCloseDetail, preserve local
  detail-tab presentation where useful, and offer onOpenFinancialProduct for the
  existing financial product page.
- Group selection and an accessible manual group editor using supplied productChoices
  and onSaveGroup. Show members/version and distinguish catalog families from manual
  groups. Do not infer family membership or deduplicate spend in UI code.
- Distinguish total product sales from ad-attributed sales; own-product, sibling,
  outside-group and unknown cross-sales are separate evidence. Never repeat sales
  into totals or invent a customer-level journey.
- Distinguish configured bid, inherited default bid and actual CPC. Current bid
  metadata is not historical bid evidence. Unknown configuration remains unavailable.
- Loading, empty, partial-coverage, stale/error-with-previous-data, unavailable
  comparison, missing-cost and shared-ad-group attribution states.
- Responsive cards/details at 375px and a scannable table layout at 1280px.
  All essential controls/evidence work with touch and keyboard; no hover-only flow.

## Separation and truthfulness

UI renders precomputed values, deltas, ratios, rankings, trends and findings. Do not
calculate business metrics, tax, profit, group aggregates, recommendations or SKU
attribution in React. Pixel/chart geometry, display formatting and local disclosure
state are presentation work. Use supplied formatMoney; show unavailable values as
“—” with supplied reasons/notices. Send filters/sort/page choices as specifications
rather than aggregating datasets in the UI.

No fetch/native/credential/storage calls in UI. Do not import adapters or server
modules. No new packages, shared-file refactors, runtime plugin system or production
mock data. Build an isolated fixture harness with clearly marked illustrative
models, including search-term/group/bid/cross-sale states not yet available live.
Fixtures belong only to tests/fixtures and must not enter production bundles.

The contract supports four views, but data readiness is controlled by Codex. If a
field/callback is missing, document a contract request in the result file and use
the existing optional/unavailable state; do not silently modify the contract.

## Validation and completion

Read AGENTS.md, PROJECT_CONTEXT.md, ARCHITECTURE.md, DECISIONS.md and ROADMAP.md.
The worktree is intentionally dirty and shared. Preserve all existing edits,
including workspace.css/todo.md and the new desktop/native Ads files.

Add focused UI browser checks for 375px/1280px, view selection, entity details/Back,
manual group form callback, null metrics, coverage warnings and keyboard operation.
Use the installed /usr/bin/chromium when running Playwright. Run the focused UI
checks and typecheck as appropriate; report concurrent external-file failures
without editing files outside your ownership. Do not run broad live API tests,
change credentials/caches, send review requests, install APKs, push or deploy.

Finish docs/ADVERTISING_UI_RESULT.md with:

- Status READY_FOR_CODEX_INTEGRATION (or precise outstanding blockers).
- Created files and exported component path.
- Commands/check results and desktop/mobile evidence.
- Contract requests/assumptions and remaining UI limitations.

Do not mark the feature live or fully integrated. Return the handoff to the owner;
Codex owns review, real data integration and final native packaging.
