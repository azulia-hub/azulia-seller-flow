# Seller Analytics TODO

Prioritized product backlog from the overview review.

- [x] User-friendly application foundation: organize Home, Products, Returns, Reports, and Data & Settings inside a reusable responsive shell with consistent filters, guided empty states, simpler terminology, and progressive metric disclosure.
- [x] Order-level profit drilldown: inspect sales, refunds, shipping charges and reversals, marketplace fees, advertising, reimbursements, tax, COGS, and final profit for each order.
- [x] Dedicated advertising analysis: TACOS, ROAS, daily trends, direct/unassigned spend visibility, and exportable SKU attribution.
- [x] Import history and dataset comparison: retain normalized uploads in IndexedDB, show date coverage, detect matching and report-only events, reopen saved reports, and compare matching periods with cost-aware profit metrics.
- [x] Unclassified-event manager: group unfamiliar raw transaction labels, show their financial impact and source evidence, assign a canonical category, save reusable source-specific rules locally, apply them immediately, and allow rule removal.
- [x] Return intelligence: distinguish Amazon RTO (Easy Ship handling-fee reversal present) from customer returns (no reversal), with return-loss/recovery metrics, daily and weekly trends, classification coverage, SKU search/filter/rankings, reliability labels, drilldown, and CSV exports.
- [x] Cost history: support effective-dated product costs so historical profit uses the cost applicable on the transaction date.
- [x] Product profitability screen: provide portfolio KPIs, profit/loss rankings, SKU search and status filters, sortable per-SKU sales/returns/fees/ads/COGS/profit metrics, CSV export, cost coverage, Cost Master access, and SKU-to-order drilldown while surfacing unassigned activity.
- [ ] Trends and comparisons: daily/weekly/monthly trends with previous-period and percentage comparisons.
- [x] Export and reconciliation: export filtered summaries and order-level calculations, with proof that normalized totals reconcile to source data.
- [ ] Saved views: retain useful filter combinations such as a month, state, SKU group, or missing-cost selection.
- [x] Backup and restore: export and restore saved reports, cost master, and classification rules with format validation.

Avoid adding decorative metrics that cannot be traced to source events. Every financial result should support drilldown and reconciliation.
