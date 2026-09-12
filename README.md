# Azulia Seller Flow — MVP

A local-first, responsive React + TypeScript analytics workbench inspired by the generic AWK pipeline philosophy:

`source -> normalize -> enrich -> filter -> aggregate -> calculate -> visualize -> insight`

## Run

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

Browser-level regression tests:

```bash
npx playwright install chromium
npm run test:e2e
```

## Current MVP

- Responsive polished dashboard shell
- CSV import in browser
- Data-quality/reconciliation surface
- No-code metric builder UI
- Cost master / missing-cost assistant
- KPI dashboard
- Product table and visual analytics
- Mobile responsive navigation
- Local-first privacy UX
- Core CSV + metric logic separated from React UI
- Versioned local backup and restore for reports, costs, and classification rules
- Audit workbook export and explicit financial reconciliation

## Deployment

Push `main` to run verification and deploy `dist/` through GitHub Pages. In the repository settings, set **Pages → Source** to **GitHub Actions**. The Vite build uses relative asset paths so it works from a repository subpath.

Do not commit seller reports or exported backups. `reprot/` is ignored because marketplace files can contain order and location information. See [PRIVACY.md](PRIVACY.md).

## Architecture rule

`src/core` must remain pure TypeScript and should not import React or visualization libraries.

Future adapters (Amazon, Flipkart, generic CSV), DuckDB-Wasm, IndexedDB, charts, forecasting and saved dashboards plug into this core through interfaces rather than business logic being embedded in components.
