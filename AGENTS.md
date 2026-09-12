# AGENTS.md — Instructions for Coding Agents

This repository contains a generic seller analytics platform.

## Mandatory Reading Before Code Changes

Before implementing or modifying architecture/business logic, read:

1. PROJECT_CONTEXT.md
2. ARCHITECTURE.md
3. DECISIONS.md
4. ROADMAP.md

Treat those files as the project source of truth unless the user explicitly changes a decision.

## Non-Negotiable Engineering Rules

### Core Independence

- `core/` must remain pure TypeScript.
- Do not import React, ECharts, Dexie, DuckDB, DOM APIs, or marketplace-specific modules into `core/`.
- Keep core functions deterministic and independently testable whenever possible.

### Generic Analytics

Never hard-code Amazon/Flipkart business terms into generic filter, aggregate, formula, render, or visualization logic.

Marketplace-specific behavior belongs in adapters/configuration.

### UI Separation

React components must not calculate business metrics.

UI should create declarative specs and display engine results.

### Unknown Data

Never silently discard unknown fields or financial events.

Preserve raw labels and surface unclassified values in data-quality views.

### Financial Integrity

When normalization supports reconciliation, normalized monetary total must equal source monetary total.

Do not include bank settlement transfers in operating profit.

### Cost Safety

Never silently assume missing product cost is zero.

Use explicit missing-cost status and configured policy.

### Formula Safety

Never use `eval()` for user-defined metrics.

Use typed expression trees / ASTs.

Detect circular metric dependencies.

### Dependency Policy

Before adding a dependency:

1. Confirm it solves a non-trivial problem.
2. Prefer actively maintained libraries with strong adoption and TypeScript support.
3. Avoid duplicate libraries for the same purpose.
4. Hide external APIs behind local adapters/interfaces when practical.
5. Do not add a package for trivial utilities that can be implemented safely in a few lines.
6. Update documentation when introducing an architectural dependency.

### Testing

Every new core behavior should include tests.

Important invariants to test:

- normalization preserves money
- unknown financial events remain present
- filters compose correctly
- good returns reverse COGS
- settlement does not affect operating profit
- custom metric dependencies evaluate in correct order
- circular formulas fail validation
- missing-cost behavior follows configured policy

### Mobile

Do not ship major UI flows that only work on desktop.

Test responsive behavior for:

- upload
- filters
- cost entry
- metric builder
- dashboards
- tables/drilldowns

## Preferred Implementation Pattern

```text
DATA + SPECIFICATION = RESULT
```

Examples:

- raw dataset + MappingSpec = canonical dataset
- dataset + FilterSpec = filtered dataset
- dataset + AggregateSpec = grouped result
- metrics + MetricSpec = calculated metric
- result + ChartSpec = visualization

Avoid one-off feature-specific calculation components.

## Before Completing a Task

Check:

- Is business logic in the correct layer?
- Is the feature generic where it should be?
- Did a marketplace-specific assumption leak into core?
- Can this module be independently tested/replaced?
- Are new dependencies really necessary?
- Does mobile still work?
- Are errors/data-quality issues visible rather than silently ignored?
- Does documentation/ROADMAP need an update?
