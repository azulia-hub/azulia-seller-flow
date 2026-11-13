# Parallel implementation contract — Products and inventory

Owner authorizes implementation only. No test execution, typecheck, builds, APK packaging/install, live API requests, migrations on real data, commits or pushes until explicitly authorized.

## Ownership
Codex owns existing files, Product Performance UI, comparisons, pull-to-refresh, integration, shared docs/config/dependencies.
Antigravity owns ONLY new files under:
- src/core/inventory/
- src/adapters/amazon-inventory/
- src/features/inventory/
- docs/inventory/ (implementation notes and proposed integration patch as text)
Do not edit existing files, index barrels, App.tsx, source sync, device/native storage, server routes, package files or shared styles. Do not reset/stash/checkout anyone else's changes. Existing uncommitted changes belong to the current work and must be preserved.

## Deliverables
1. Pure deterministic generic inventory types and restock functions. No React, marketplace labels or runtime/database imports in core. Identity seller account + marketplace + SKU + fulfillment channel. Distinguish available/reserved/inbound/unsellable/listed/manual physical quantities; null means unknown, not zero. Timestamp and source provenance on records. Do not subtract reservations twice. Separate current inventory from historical financial periods.
2. Demand input from shipped quantities with explicit observed days and coverage. Windows 7/30/90 days. Missing history, stockout-biased demand and zero demand carry explicit confidence/status; no division by zero/infinite days. Financial SALE rows are not automatically a shipment count. Refunds do not make stock available.
3. Lead time, safety days, replenishment coverage, minimum quantity, pack multiple and qualifying inbound settings. Reorder point=daily demand*(lead+safety). Target=daily demand*(lead+safety+coverage). Recommendation=max(0,target-usable-qualifying inbound), rounded to minimum and pack rules when positive. Unknown required data produces unavailable recommendations. Inbound needs explicit eligibility/arrival information; avoid double counting.
4. Amazon adapter parsers for documented listing/inventory responses, with raw preservation, explicit pagination/completeness and error statuses. Inspect existing source transport contracts read-only. No credentials/API calls from React. Unknown values preserved. FBA/listed FBM availability/manual physical stock distinct. Inventory failures independent from financial sync. No fictional Amazon endpoint fields; verify official documentation if needed.
5. Dependency-free presentational inventory/replenishment components using supplied records/results/callbacks; optional stylesheet only under owned directory. Mobile layout and accessible labelled fields. No global App integration or duplicated scheduler. Existing product identity/title/image provided as props.
6. Proposed storage/sync integration contract (documentation ONLY): versioned per-account keys, atomic page checkpoints, complete/partial inventory status, bounded changed snapshots plus daily history, deduplicated status-transition alerts, existing shared sync coordinator only. Describe proposed interfaces clearly; no new background timer or direct database writes. No cloud storage.
7. Author focused core test files for future authorized execution; DO NOT RUN them. Cover unknown stock, quantities, reserved/inbound semantics, rounding, empty/partial demand, status transitions and identity isolation.

## Completion
Provide exact new file list, exported interfaces, remaining integration steps and assumptions in docs/inventory/HANDOFF.md. Do not claim integrated or verified. Codex will review and wire existing files after your work is complete. If an existing file must change, document a proposed diff; do not apply it. Do not move outside the ownership scope without coordinating through the user.
