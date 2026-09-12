import type {
  CanonicalDataset,
  CanonicalEventKind,
  CanonicalFinancialEvent,
  RawDataset,
  RawRow,
} from '../data/types'
import { reconcileFinancials } from '../validation/reconcileFinancials'
import type { MappingSpec } from './types'

const normalized = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')

function lookup(row: RawRow, column?: string): unknown {
  if (!column) return undefined
  const wanted = normalized(column)
  const entry = Object.entries(row).find(([key]) => normalized(key) === wanted)
  return entry?.[1]
}

function text(row: RawRow, column?: string): string {
  const value = lookup(row, column)
  return value === undefined || value === null ? '' : String(value).trim()
}

function nullable(value: string): string | null {
  return value === '' ? null : value
}

function number(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const cleaned = String(value ?? '').trim().replace(/[₹,$£€\s]/g, '').replace(/^\((.*)\)$/, '-$1')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export function normalizeDataset(input: RawDataset, spec: MappingSpec): CanonicalDataset {
  const events: CanonicalFinancialEvent[] = []
  const unknownTypes = new Set<string>()
  const typeMappings = new Map((spec.types ?? []).map((rule) => [normalized(rule.value), rule]))
  let sourceTotal = 0
  let supportsReconciliation = Boolean(spec.totalColumn)
  const fieldText = (row: RawRow, field: keyof MappingSpec['fields']) => {
    let value = text(row, spec.fields[field])
    for (const transform of spec.fieldTransforms ?? []) {
      if (transform.field === field && transform.operation === 'stripSuffix' && value.endsWith(transform.value)) {
        value = value.slice(0, -transform.value.length)
      }
    }
    return value
  }

  input.rows.forEach((raw, rowIndex) => {
    const rawType = text(raw, spec.fields.rawType)
    const typeRule = typeMappings.get(normalized(rawType))
    if (spec.fields.rawType && !typeRule) unknownTypes.add(rawType || '(blank)')
    let emittedTotal = 0
    const mappedColumns = new Set<string>()

    spec.amounts.forEach((amountRule) => {
      const columnKey = normalized(amountRule.column)
      if (mappedColumns.has(columnKey)) return
      if (amountRule.when) {
        const actual = normalized(text(raw, amountRule.when.column))
        const expected = normalized(amountRule.when.value)
        const matches = amountRule.when.operator === 'equals' ? actual === expected : actual.includes(expected)
        if (!matches) return
      }
      const amount = number(lookup(raw, amountRule.column))
      if (amount === null || amount === 0) return
      mappedColumns.add(columnKey)
      emittedTotal = money(emittedTotal + amount)
      const event: CanonicalEventKind = typeRule?.event ?? (spec.fields.rawType ? 'UNKNOWN' : amountRule.event)
      events.push({
        id: `${input.id}:${rowIndex + 1}:${amountRule.column}`,
        source: spec.source,
        sourceDatasetId: input.id,
        sourceRow: rowIndex + 1,
        date: nullable(fieldText(raw, 'date')),
        orderId: nullable(fieldText(raw, 'orderId')),
        sku: nullable(fieldText(raw, 'sku')),
        event: event === 'SALE' ? amountRule.event : event,
        quantity: number(lookup(raw, spec.fields.quantity)),
        amount,
        amountClass: typeRule?.amountClass ?? amountRule.amountClass ?? 'OPERATING',
        amountType: amountRule.amountType,
        state: nullable(fieldText(raw, 'state')),
        city: nullable(fieldText(raw, 'city')),
        accountType: nullable(fieldText(raw, 'accountType')),
        fulfillmentType: nullable(fieldText(raw, 'fulfillmentType')),
        status: nullable(fieldText(raw, 'status')),
        rawType,
        rawDescription: nullable(fieldText(raw, 'description')),
        classified: !spec.fields.rawType || Boolean(typeRule),
        raw,
      })
    })

    if (spec.totalColumn) {
      const total = number(lookup(raw, spec.totalColumn))
      if (total === null) {
        supportsReconciliation = false
        return
      }
      sourceTotal = money(sourceTotal + total)
      const residual = money(total - emittedTotal)
      if (residual !== 0) {
        const event = typeRule?.event ?? ('UNKNOWN' as const)
        events.push({
          id: `${input.id}:${rowIndex + 1}:unclassified-residual`, source: spec.source,
          sourceDatasetId: input.id, sourceRow: rowIndex + 1,
          date: nullable(fieldText(raw, 'date')), orderId: nullable(fieldText(raw, 'orderId')),
          sku: nullable(fieldText(raw, 'sku')), event, quantity: number(lookup(raw, spec.fields.quantity)),
          amount: residual, amountClass: typeRule?.amountClass ?? 'OPERATING', amountType: 'UNKNOWN',
          state: nullable(fieldText(raw, 'state')), city: nullable(fieldText(raw, 'city')),
          accountType: nullable(fieldText(raw, 'accountType')), fulfillmentType: nullable(fieldText(raw, 'fulfillmentType')),
          status: nullable(fieldText(raw, 'status')), rawType,
          rawDescription: nullable(fieldText(raw, 'description')) ?? 'Unmapped difference from source total',
          classified: false, raw,
        })
      }
    }
  })

  const reconciliation = reconcileFinancials(events, supportsReconciliation ? sourceTotal : null)
  const missing = (column?: string) => column ? input.rows.filter((row) => !text(row, column)).length : input.rows.length
  return {
    source: spec.source,
    events,
    quality: {
      source: spec.source,
      sourceRowCount: input.rows.length,
      normalizedEventCount: events.length,
      unknownTransactionTypes: [...unknownTypes].sort(),
      unclassifiedEventCount: events.filter((event) => !event.classified).length,
      missingKeys: { orderId: missing(spec.fields.orderId), sku: missing(spec.fields.sku), date: missing(spec.fields.date) },
      reconciliation,
    },
  }
}
