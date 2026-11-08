import type {
  CanonicalDataset,
  CanonicalEventKind,
  CanonicalFinancialEvent,
  RawDataset,
} from '../data/types'
import { reconcileFinancials } from '../validation/reconcileFinancials'
import type { MappingSpec } from './types'

const normalized = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')

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
  const labels = new Map<string, string>()
  const normalizeLabel = (value: string) => {
    const cached = labels.get(value)
    if (cached !== undefined) return cached
    const result = normalized(value); labels.set(value, result); return result
  }
  const events: CanonicalFinancialEvent[] = []
  const unknownTypes = new Set<string>()
  const typeMappings = new Map((spec.types ?? []).map((rule) => [normalizeLabel(rule.value), rule]))
  let sourceTotal = 0
  let supportsReconciliation = Boolean(spec.totalColumn)
  const missingKeys = { orderId: 0, sku: 0, date: 0 }

  input.rows.forEach((raw, rowIndex) => {
    const cells = new Map<string, unknown>()
    for (const [key, value] of Object.entries(raw)) { const name = normalizeLabel(key); if (!cells.has(name)) cells.set(name, value) }
    const lookup = (column?: string) => column ? cells.get(normalizeLabel(column)) : undefined
    const text = (column?: string) => { const value = lookup(column); return value === undefined || value === null ? '' : String(value).trim() }
    const fieldText = (field: keyof MappingSpec['fields']) => {
      let value = text(spec.fields[field])
      for (const transform of spec.fieldTransforms ?? []) {
        if (transform.field === field && transform.operation === 'stripSuffix' && value.endsWith(transform.value)) {
          value = value.slice(0, -transform.value.length)
        }
      }
      return value
    }
    for (const key of ['orderId','sku','date'] as const) if (!spec.fields[key] || !text(spec.fields[key])) missingKeys[key]++
    const rawType = text(spec.fields.rawType)
    const typeRule = typeMappings.get(normalizeLabel(rawType))
    if (spec.fields.rawType && !typeRule) unknownTypes.add(rawType || '(blank)')
    let emittedTotal = 0
    const mappedColumns = new Set<string>()

    spec.amounts.forEach((amountRule) => {
      const columnKey = normalizeLabel(amountRule.column)
      if (mappedColumns.has(columnKey)) return
      if (amountRule.when) {
        const actual = normalizeLabel(text(amountRule.when.column))
        const expected = normalizeLabel(amountRule.when.value)
        const matches = amountRule.when.operator === 'equals' ? actual === expected : actual.includes(expected)
        if (!matches) return
      }
      const amount = number(lookup(amountRule.column))
      if (amount === null || amount === 0) return
      mappedColumns.add(columnKey)
      emittedTotal = money(emittedTotal + amount)
      const event: CanonicalEventKind = typeRule?.event ?? (spec.fields.rawType ? 'UNKNOWN' : amountRule.event)
      events.push({
        id: `${input.id}:${rowIndex + 1}:${amountRule.column}`,
        source: spec.source,
        sourceDatasetId: input.id,
        sourceRow: rowIndex + 1,
        date: nullable(fieldText('date')),
        orderId: nullable(fieldText('orderId')),
        sku: nullable(fieldText('sku')),
        event: event === 'SALE' ? amountRule.event : event,
        quantity: number(lookup(spec.fields.quantity)),
        amount,
        amountClass: typeRule?.amountClass ?? amountRule.amountClass ?? 'OPERATING',
        amountType: amountRule.amountType,
        state: nullable(fieldText('state')),
        city: nullable(fieldText('city')),
        accountType: nullable(fieldText('accountType')),
        fulfillmentType: nullable(fieldText('fulfillmentType')),
        status: nullable(fieldText('status')),
        rawType,
        rawDescription: nullable(fieldText('description')),
        classified: !spec.fields.rawType || Boolean(typeRule),
        raw,
      })
    })

    if (spec.totalColumn) {
      const total = number(lookup(spec.totalColumn))
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
          date: nullable(fieldText('date')), orderId: nullable(fieldText('orderId')),
          sku: nullable(fieldText('sku')), event, quantity: number(lookup(spec.fields.quantity)),
          amount: residual, amountClass: typeRule?.amountClass ?? 'OPERATING', amountType: 'UNKNOWN',
          state: nullable(fieldText('state')), city: nullable(fieldText('city')),
          accountType: nullable(fieldText('accountType')), fulfillmentType: nullable(fieldText('fulfillmentType')),
          status: nullable(fieldText('status')), rawType,
          rawDescription: nullable(fieldText('description')) ?? 'Unmapped difference from source total',
          classified: false, raw,
        })
      }
    }
  })

  const reconciliation = reconcileFinancials(events, supportsReconciliation ? sourceTotal : null)
  return {
    source: spec.source,
    events,
    quality: {
      source: spec.source,
      sourceRowCount: input.rows.length,
      normalizedEventCount: events.length,
      unknownTransactionTypes: [...unknownTypes].sort(),
      unclassifiedEventCount: events.filter((event) => !event.classified).length,
      missingKeys,
      reconciliation,
    },
  }
}
