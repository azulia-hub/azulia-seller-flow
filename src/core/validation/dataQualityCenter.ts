import type { ProductCost } from '../costs/types'
import type { CanonicalDataset, CanonicalFinancialEvent } from '../data/types'
import type { StoredImport } from '../imports/importHistory'
import { calculateCosts } from '../costs/calculateCosts'

export type QualitySeverity = 'GOOD' | 'WARNING' | 'CRITICAL'
export type QualityAction = 'REVIEW_CLASSIFICATION' | 'MANAGE_COSTS' | 'COMPARE_REPORTS' | 'REVIEW_EVENTS' | null

export interface QualityCheck {
  readonly id: string
  readonly label: string
  readonly severity: QualitySeverity
  readonly value: string
  readonly explanation: string
  readonly action: QualityAction
}

export interface QualityEvidence {
  readonly id: string
  readonly date: string | null
  readonly orderId: string | null
  readonly sku: string | null
  readonly label: string
  readonly amount: number
  readonly reason: string
}

export interface ReportOverlap {
  readonly importId: string
  readonly fileName: string
  readonly matchingEvents: number
  readonly coveragePercent: number
}

export interface DataQualityCenterResult {
  readonly overall: QualitySeverity
  readonly attentionCount: number
  readonly checks: readonly QualityCheck[]
  readonly missingCostSkus: readonly string[]
  readonly missingCostSales: number
  readonly missingCostOrders: number
  readonly releasedEvents: number
  readonly deferredEvents: number
  readonly otherStatusEvents: number
  readonly unassignedAdvertising: number
  readonly unassignedMarketplaceCharges: number
  readonly duplicateEventCount: number
  readonly overlaps: readonly ReportOverlap[]
  readonly evidence: readonly QualityEvidence[]
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
// Source evidence, rather than user-editable classifications, identifies the same event across imports.
const key = (event: CanonicalFinancialEvent) => [event.source, event.date ?? '', event.orderId ?? '', event.sku ?? '', event.amount, event.quantity ?? '', event.rawType, event.rawDescription ?? '', event.state ?? '', event.city ?? '', event.status ?? ''].join('\u001f')
const eventEvidence = (event: CanonicalFinancialEvent, reason: string): QualityEvidence => ({ id: event.id, date: event.date, orderId: event.orderId, sku: event.sku, label: event.rawType || event.event, amount: event.amount, reason })

function overlapCount(left: readonly CanonicalFinancialEvent[], right: readonly CanonicalFinancialEvent[]) {
  const available = new Map<string, number>()
  right.forEach(event => available.set(key(event), (available.get(key(event)) ?? 0) + 1))
  return left.reduce((total, event) => {
    const fingerprint = key(event), count = available.get(fingerprint) ?? 0
    if (!count) return total
    available.set(fingerprint, count - 1)
    return total + 1
  }, 0)
}

export function buildDataQualityCenter(dataset: CanonicalDataset, costs: readonly ProductCost[], imports: readonly StoredImport[] = [], currentImportId: string | null = null, normalizeSku: (sku: string) => string = sku => sku): DataQualityCenterResult {
  const events = dataset.events
  const skuKey = (sku: string) => normalizeSku(sku).trim().toLocaleLowerCase()
  const saleEvents = events.filter(event => event.event === 'SALE' && event.amountType === 'PRODUCT_REVENUE' && event.amount > 0 && event.sku)
  const costCoverage = calculateCosts(events, costs, 'BLOCK', normalizeSku)
  const missingCostSkus = costCoverage.missingSkus
  const missingSet = new Set(missingCostSkus.map(skuKey))
  const appliedIds = new Set(costCoverage.appliedCosts.map(item => item.eventId))
  const missingSalesEvents = saleEvents.filter(event => !appliedIds.has(event.id) && event.sku && missingSet.has(skuKey(event.sku)))
  const unclassified = events.filter(event => event.amountClass === 'OPERATING' && !event.classified)
  const unassignedAds = events.filter(event => event.amountClass === 'OPERATING' && event.amountType === 'ADVERTISING_FEE' && !event.sku)
  const marketplaceTypes = new Set(['COMMISSION', 'FULFILLMENT_FEE', 'OTHER_FEE'])
  const unassignedMarketplace = events.filter(event => event.amountClass === 'OPERATING' && marketplaceTypes.has(event.amountType) && !event.sku && !event.orderId)
  const missingOrderEvents = events.filter(event => (event.event === 'SALE' || event.event === 'REFUND') && !event.orderId)
  const missingSkuEvents = events.filter(event => event.amountType === 'PRODUCT_REVENUE' && (event.event === 'SALE' || event.event === 'REFUND') && !event.sku)
  const missingDateEvents = events.filter(event => !event.date)
  const missingKeyEvents = [...new Map([...missingOrderEvents, ...missingSkuEvents, ...missingDateEvents].map(event => [event.id, event])).values()]
  const seen = new Set<string>(), duplicateEvents: CanonicalFinancialEvent[] = []
  events.forEach(event => { const fingerprint = key(event); if (seen.has(fingerprint)) duplicateEvents.push(event); else seen.add(fingerprint) })
  const releasedEvents = events.filter(event => event.status?.trim().toLocaleLowerCase() === 'released').length
  const deferredEvents = events.filter(event => event.status?.trim().toLocaleLowerCase() === 'deferred').length
  const otherStatusEvents = events.length - releasedEvents - deferredEvents
  const overlaps = imports.filter(item => item.id !== currentImportId).map(item => {
    const matchingEvents = overlapCount(events, item.dataset.events)
    return { importId: item.id, fileName: item.fileName, matchingEvents, coveragePercent: events.length ? round(matchingEvents / events.length * 100) : 0 }
  }).filter(item => item.matchingEvents > 0).sort((a, b) => b.coveragePercent - a.coveragePercent)
  const reconciliation = dataset.quality.reconciliation
  const reconciliationSeverity: QualitySeverity = !reconciliation.supported || reconciliation.reconciled ? 'GOOD' : 'CRITICAL'
  const checks: QualityCheck[] = [
    { id: 'reconciliation', label: 'Money reconciliation', severity: reconciliationSeverity, value: reconciliation.supported ? (reconciliation.reconciled ? 'Matched' : `Difference ${round(reconciliation.difference ?? 0)}`) : 'Not supported', explanation: reconciliation.supported ? `${round(reconciliation.sourceTotal ?? 0)} in source · ${round(reconciliation.normalizedTotal)} normalized` : 'The source format did not provide enough information for a financial reconciliation.', action: reconciliation.reconciled || !reconciliation.supported ? null : 'REVIEW_EVENTS' },
    { id: 'classification', label: 'Unclassified activity', severity: unclassified.length ? 'WARNING' : 'GOOD', value: `${unclassified.length} events`, explanation: `${round(unclassified.reduce((sum, event) => sum + event.amount, 0))} net financial impact remains included.`, action: unclassified.length ? 'REVIEW_CLASSIFICATION' : null },
    { id: 'costs', label: 'Product cost coverage', severity: missingCostSkus.length ? 'WARNING' : 'GOOD', value: missingCostSkus.length ? `${missingCostSkus.length} SKUs missing` : 'Complete', explanation: `${round(missingSalesEvents.reduce((sum, event) => sum + event.amount, 0))} of gross sales is affected.`, action: missingCostSkus.length ? 'MANAGE_COSTS' : null },
    { id: 'overlap', label: 'Duplicate and overlapping data', severity: duplicateEvents.length || overlaps.length ? 'WARNING' : 'GOOD', value: duplicateEvents.length ? `${duplicateEvents.length} duplicate events` : overlaps.length ? `${overlaps.length} overlapping reports` : 'No issue found', explanation: overlaps[0] ? `Highest saved-report overlap is ${overlaps[0].coveragePercent.toFixed(1)}% with ${overlaps[0].fileName}.` : 'No matching saved-report activity was found.', action: duplicateEvents.length || overlaps.length ? 'COMPARE_REPORTS' : null },
    { id: 'status', label: 'Transaction release status', severity: deferredEvents ? 'WARNING' : 'GOOD', value: `${releasedEvents} released · ${deferredEvents} deferred`, explanation: otherStatusEvents ? `${otherStatusEvents} events have another or missing status.` : 'All events use a recognized released or deferred status.', action: deferredEvents || otherStatusEvents ? 'REVIEW_EVENTS' : null },
    { id: 'attribution', label: 'Unassigned charges', severity: unassignedAds.length || unassignedMarketplace.length ? 'WARNING' : 'GOOD', value: `${unassignedAds.length + unassignedMarketplace.length} events`, explanation: `${round(-unassignedAds.reduce((sum, event) => sum + event.amount, 0))} advertising and ${round(-unassignedMarketplace.reduce((sum, event) => sum + event.amount, 0))} marketplace charges cannot be assigned to one SKU.`, action: unassignedAds.length || unassignedMarketplace.length ? 'REVIEW_EVENTS' : null },
    { id: 'keys', label: 'Missing required identifiers', severity: missingKeyEvents.length ? 'WARNING' : 'GOOD', value: `${missingKeyEvents.length} events`, explanation: `${missingOrderEvents.length} sales/refunds lack order IDs · ${missingSkuEvents.length} product events lack SKUs · ${missingDateEvents.length} events lack dates. Global charges are not treated as missing product identifiers.`, action: missingKeyEvents.length ? 'REVIEW_EVENTS' : null },
  ]
  const attentionCount = checks.filter(check => check.severity !== 'GOOD').length
  return {
    overall: checks.some(check => check.severity === 'CRITICAL') ? 'CRITICAL' : attentionCount ? 'WARNING' : 'GOOD', attentionCount, checks,
    missingCostSkus, missingCostSales: round(missingSalesEvents.reduce((sum, event) => sum + event.amount, 0)), missingCostOrders: new Set(missingSalesEvents.flatMap(event => event.orderId ? [event.orderId] : [])).size,
    releasedEvents, deferredEvents, otherStatusEvents,
    unassignedAdvertising: round(-unassignedAds.reduce((sum, event) => sum + event.amount, 0)), unassignedMarketplaceCharges: round(-unassignedMarketplace.reduce((sum, event) => sum + event.amount, 0)),
    duplicateEventCount: duplicateEvents.length, overlaps,
    evidence: [...unclassified.map(event => eventEvidence(event, 'Unclassified')), ...duplicateEvents.map(event => eventEvidence(event, 'Possible duplicate')), ...events.filter(event => event.status?.trim().toLocaleLowerCase() === 'deferred').map(event => eventEvidence(event, 'Deferred')), ...unassignedAds.map(event => eventEvidence(event, 'Unassigned advertising')), ...unassignedMarketplace.map(event => eventEvidence(event, 'Unassigned marketplace charge')), ...missingKeyEvents.map(event => eventEvidence(event, 'Missing identifier'))],
  }
}
