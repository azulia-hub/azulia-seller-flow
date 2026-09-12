# Seller Analytics — Architecture

## Architectural Goal

Preserve the functional composition philosophy of the original AWK engine while implementing a browser-native React/TypeScript application.

High-level flow:

```text
Data Source
    ↓
Source Adapter
    ↓
Normalize
    ↓
Canonical Events
    ↓
Enrich
    ↓
Filter
    ↓
Aggregate
    ↓
Metric / Formula Engine
    ↓
Visualization / Dashboard / Insight / Forecast
```

## Layering

### 1. UI Layer

Responsibilities:

- render screens/components
- collect user intent
- build declarative specs
- show results

Must NOT:

- calculate profit
- classify marketplace transactions
- normalize source files
- contain SQL/business formulas

### 2. Application Layer

Responsibilities:

- orchestrate workflows
- connect UI specs to analytics engine
- manage datasets and saved views
- coordinate persistence and workers

### 3. Core Domain Layer

Pure TypeScript only.

Recommended modules:

```text
core/
  data/
  normalize/
  filter/
  enrich/
  aggregate/
  metrics/
  formula/
  insights/
  forecast/
  scenario/
  validation/
```

Rules:

- no React imports
- no ECharts imports
- no Dexie imports
- no DuckDB imports
- no DOM access
- no mutable global analytics state

### 4. Adapters

Marketplace or infrastructure-specific behavior lives here.

Examples:

```text
adapters/
  amazon/
  flipkart/
  meesho/
  generic-csv/
  duckdb/
  indexeddb/
  charts/
```

## Core Interfaces

### Data Source

```ts
interface DataSource {
  id: string
  name: string
  load(): Promise<RawDataset>
  refresh?(): Promise<RawDataset>
}
```

Potential implementations:

- CsvSource
- ExcelSource
- AmazonApiSource
- FlipkartApiSource
- GoogleSheetsSource

### Source Adapter

```ts
interface SourceAdapter {
  id: string
  detect(input: RawDataset): DetectionResult
  normalize(input: RawDataset, mapping?: MappingSpec): CanonicalDataset
}
```

### Analytics Engine

```ts
interface AnalyticsEngine {
  execute(dataset: DatasetRef, query: QuerySpec): Promise<ResultSet>
}
```

Implementations may include:

- JavaScriptAnalyticsEngine
- DuckDbAnalyticsEngine

The rest of the app should not care which implementation is used.

## Canonical Event Model

Prefer a long/event-based financial representation.

A source row may emit multiple canonical financial events.

Example:

```text
ORDER_ID | SKU | EVENT | AMOUNT | AMOUNT_TYPE
A001     | X1  | SALE  | 899    | PRODUCT_REVENUE
A001     | X1  | FEE   | -90    | COMMISSION
A001     | X1  | FEE   | -75    | SHIPPING
```

Why:

- new fee types do not require schema changes
- all financial components remain auditable
- generic aggregation becomes easier
- unknown financial events can still be preserved

## Query Specification

UI must produce structured query specs rather than code.

Example:

```json
{
  "filters": [
    {"field":"STATE","op":"eq","value":"GUJARAT"},
    {"field":"RETURN_RATE","op":"gt","value":20}
  ],
  "groupBy": ["SKU"],
  "metrics": ["GROSS_SALES","NET_PROFIT"],
  "sort": [{"field":"NET_PROFIT","direction":"desc"}],
  "limit": 10
}
```

## Filter Model

Generic operators should include:

- eq
- neq
- contains
- notContains
- startsWith
- endsWith
- gt
- gte
- lt
- lte
- between
- in
- notIn
- isEmpty
- isNotEmpty
- dateBefore
- dateAfter
- dateBetween

Support nested AND/OR groups.

## Metric Model

Metrics are specifications.

Example aggregate metric:

```json
{
  "id":"gross_sales",
  "type":"aggregate",
  "aggregation":"sum",
  "field":"AMOUNT",
  "filters":[{"field":"AMOUNT_TYPE","op":"eq","value":"PRODUCT_REVENUE"}]
}
```

Example formula metric:

```json
{
  "id":"profit_margin",
  "type":"formula",
  "format":"percent",
  "expression": {
    "op":"divide",
    "left":{"metric":"net_profit"},
    "right":{"metric":"gross_sales"}
  }
}
```

Never use eval().

## Metric Dependency Graph

Metric references create a directed graph.

Requirements:

- topological evaluation order
- circular dependency detection
- prevent deleting a metric that is referenced by others without confirmation/repair

## Cost Master Architecture

Represent cost master independently of source data.

Persisted model:

```ts
interface ProductCost {
  sku: string
  unitCost: number
  effectiveFrom?: string | null
  updatedAt: string
}
```

Multiple records may exist for a SKU. The newest `effectiveFrom` on or before the transaction date applies. An undated record is the fallback for dates not covered by a dated record. Refund COGS reversal uses the related original sale date when that sale is available.

Missing cost policy should be configurable:

- block final profit calculation
- warn but calculate partial profit
- explicitly assume zero (never default silently)

## Worker Architecture

Heavy work should run outside React main thread.

```text
React Main Thread
      ↓ messages
Analytics Web Worker
      ↓
Parser / Normalize / DuckDB / Metrics / Forecast
```

## Storage Architecture

Initial local-first design:

- IndexedDB for application config, mappings, cost master, saved metrics, dashboards, saved views
- analytical dataset in browser memory / DuckDB-Wasm as appropriate

Future cloud sync should be an adapter, not a rewrite.

## Visualization Architecture

Chart components consume declarative specs.

Example:

```json
{
  "type":"bar",
  "dimension":"SKU",
  "metric":"NET_PROFIT",
  "sort":"desc",
  "limit":10
}
```

Charts do not calculate business metrics.

## Dashboard Architecture

A dashboard is a saved specification:

```ts
interface DashboardSpec {
  id: string
  title: string
  globalFilters: FilterGroup
  widgets: WidgetSpec[]
}
```

Widgets may include:

- KPI
- Chart
- Table
- Text/Insight
- Data quality

## Insight Architecture

Rules are independent pure functions:

```ts
type InsightRule = (context: AnalysisContext) => Insight[]
```

Examples:

- detectHighReturnRate
- detectNegativeProfitSku
- detectHighTacos
- detectCostCoverageRisk
- detectConcentrationRisk

## Forecast Architecture

```ts
interface ForecastModel {
  id: string
  forecast(series: TimeSeries, options: ForecastOptions): ForecastResult
}
```

## Plugin Direction

Long-term plugin interfaces may exist for:

- source adapters
- transforms
- metrics
- chart renderers
- insight rules
- forecast models
- data sources

But do not over-engineer plugin loading in the MVP. Start with strong internal interfaces first.

## Recommended Folder Structure

```text
src/
  app/
  core/
    data/
    normalize/
    filter/
    enrich/
    aggregate/
    metrics/
    formula/
    insights/
    forecast/
    scenario/
  adapters/
    amazon/
    generic-csv/
    duckdb/
    indexeddb/
  engine/
    interface.ts
    javascript/
    duckdb/
  features/
    upload/
    mapping/
    filters/
    costs/
    metric-builder/
    explore/
    dashboards/
    scenarios/
  visualizations/
  components/
  persistence/
  workers/
```
