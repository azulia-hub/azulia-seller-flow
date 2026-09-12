import type { CanonicalDataset, CanonicalFinancialEvent } from '../data/types'
import type { ClassificationRule, UnclassifiedEventGroup, UnclassifiedEventSummary } from './types'

const keyPart = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
export const classificationRuleKey = (source: string, rawType: string) => `${keyPart(source)}::${keyPart(rawType)}`

export function groupUnclassifiedEvents(events: readonly CanonicalFinancialEvent[]): UnclassifiedEventGroup[] {
  const groups = new Map<string, { source: string; rawType: string; count: number; amount: number; descriptions: Set<string>; orderIds: Set<string>; amountTypes: Set<CanonicalFinancialEvent['amountType']> }>()
  events.filter((event) => !event.classified).forEach((event) => {
    const key = classificationRuleKey(event.source, event.rawType)
    const group = groups.get(key) ?? { source: event.source, rawType: event.rawType, count: 0, amount: 0, descriptions: new Set(), orderIds: new Set(), amountTypes: new Set() }
    group.count += 1
    group.amount += event.amount
    if (event.rawDescription) group.descriptions.add(event.rawDescription)
    if (event.orderId) group.orderIds.add(event.orderId)
    group.amountTypes.add(event.amountType)
    groups.set(key, group)
  })
  return [...groups.entries()].map(([key, group]) => ({ key, source: group.source, rawType: group.rawType, count: group.count, amount: Math.round(group.amount * 100) / 100, descriptions: [...group.descriptions].slice(0, 5), orderIds: [...group.orderIds].slice(0, 5), amountTypes: [...group.amountTypes] })).sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount) || right.count - left.count)
}

export function summarizeUnclassifiedEvents(events: readonly CanonicalFinancialEvent[]): UnclassifiedEventSummary {
  const groups = groupUnclassifiedEvents(events)
  return { groups, labelCount: groups.length, eventCount: groups.reduce((sum, group) => sum + group.count, 0), amount: Math.round(groups.reduce((sum, group) => sum + group.amount, 0) * 100) / 100 }
}

export function applyClassificationRules(dataset: CanonicalDataset, rules: readonly ClassificationRule[]): CanonicalDataset {
  const byKey = new Map(rules.map((rule) => [classificationRuleKey(rule.source, rule.rawType), rule]))
  const events = dataset.events.map((event): CanonicalFinancialEvent => {
    if (event.classified) return event
    const rule = byKey.get(classificationRuleKey(event.source, event.rawType))
    if (!rule) return event
    return { ...event, event: rule.event, amountClass: rule.amountClass, amountType: event.amountType === 'UNKNOWN' ? (rule.amountType ?? event.amountType) : event.amountType, classified: true }
  })
  const remainingTypes = [...new Set(events.filter((event) => !event.classified).map((event) => event.rawType || '(blank)'))].sort()
  return { ...dataset, events, quality: { ...dataset.quality, normalizedEventCount: events.length, unclassifiedEventCount: events.filter((event) => !event.classified).length, unknownTransactionTypes: remainingTypes } }
}
