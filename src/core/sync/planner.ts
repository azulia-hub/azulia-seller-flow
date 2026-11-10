import type { SyncRange } from './ranges'
import { missingRanges } from './ranges'

export const INDIA_TIMEZONE_OFFSET_MS = 330 * 60 * 1000 // +05:30 in ms

/**
 * Converts any timestamp, Date, or ISO string to an India calendar date string 'YYYY-MM-DD'.
 * Never shifts boundaries because of UTC slicing.
 */
export function toIndiaDateString(value: string | number | Date | null | undefined): string | null {
  if (!value) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    // Already an India calendar date YYYY-MM-DD without time
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed
    }
  }
  const epoch = typeof value === 'number' ? value : value instanceof Date ? value.getTime() : Date.parse(value)
  if (!Number.isFinite(epoch)) {
    return null
  }
  return new Date(epoch + INDIA_TIMEZONE_OFFSET_MS).toISOString().slice(0, 10)
}

/**
 * Returns India calendar start of day or end of day in UTC ISO format:
 * 'YYYY-MM-DD' -> 'YYYY-MM-DDT00:00:00+05:30' parsed to UTC ISO string.
 */
export function indiaDateToUtcIso(dateStr: string, isEndOfDay = false): string {
  const time = isEndOfDay ? '23:59:59.999' : '00:00:00.000'
  const epoch = Date.parse(`${dateStr}T${time}+05:30`)
  return new Date(epoch).toISOString()
}

/**
 * Returns today's date in India as 'YYYY-MM-DD'.
 */
export function getIndiaToday(now = Date.now()): string {
  return new Date(now + INDIA_TIMEZONE_OFFSET_MS).toISOString().slice(0, 10)
}

export type SyncJobKind = 'finance' | 'purchases' | 'order' | 'history' | 'catalog' | 'orderItems'
export type SyncJobState = 'pending' | 'running' | 'completed' | 'retryLater' | 'failed'

export interface PlannedJob extends SyncRange {
  readonly id: string
  readonly scope: string
  readonly kind: SyncJobKind
  readonly orderId?: string
  readonly asin?: string
  readonly nextToken: string | null
  readonly createdAt: number
  readonly state: SyncJobState
  readonly runId?: string
  readonly failureReason?: string
  readonly retries?: number
}

/**
 * Deterministic, stable resource identifier for sync jobs.
 */
export function stableJobId(kind: SyncJobKind, from: string, to: string, resourceId?: string | null): string {
  return JSON.stringify([kind, from, to, resourceId ?? ''])
}

/**
 * Checks whether a requested interval is fully covered by completed coverage windows.
 */
export function isRangeFullyCovered(wanted: SyncRange, coverage: readonly SyncRange[]): boolean {
  return missingRanges(wanted, coverage).length === 0
}

export interface RunBudget {
  readonly maxOrderItems: number
  readonly maxCatalog: number
  readonly maxHistory: number
}

export const DEFAULT_RUN_BUDGET: RunBudget = {
  maxOrderItems: 15,
  maxCatalog: 15,
  maxHistory: 15,
}

/**
 * Tracks run-scoped resources and budgets to prevent infinite requeuing loops.
 */
export class SyncRunTracker {
  readonly runId: string
  readonly budget: RunBudget
  private readonly completed = new Set<string>()
  private readonly failed = new Map<string, string>()
  private readonly touchedResources = new Set<string>()
  private orderItemsCount = 0
  private catalogCount = 0
  private historyCount = 0

  constructor(runId: string, budget: Partial<RunBudget> = {}) {
    this.runId = runId
    this.budget = { ...DEFAULT_RUN_BUDGET, ...budget }
  }

  canEnqueue(kind: SyncJobKind, resourceId: string): boolean {
    const key = `${kind}:${resourceId}`
    if (this.touchedResources.has(key)) return false
    if (this.completed.has(key)) return false
    if (this.failed.has(key)) return false

    if (kind === 'orderItems') return this.orderItemsCount < this.budget.maxOrderItems
    if (kind === 'catalog') return this.catalogCount < this.budget.maxCatalog
    if (kind === 'history') return this.historyCount < this.budget.maxHistory
    return true
  }

  recordEnqueued(kind: SyncJobKind, resourceId: string): void {
    const key = `${kind}:${resourceId}`
    this.touchedResources.add(key)
    if (kind === 'orderItems') this.orderItemsCount++
    if (kind === 'catalog') this.catalogCount++
    if (kind === 'history') this.historyCount++
  }

  recordCompleted(kind: SyncJobKind, resourceId: string): void {
    const key = `${kind}:${resourceId}`
    this.completed.add(key)
  }

  recordFailed(kind: SyncJobKind, resourceId: string, reason: string): void {
    const key = `${kind}:${resourceId}`
    this.failed.set(key, reason)
  }

  isResourceCompleted(kind: SyncJobKind, resourceId: string): boolean {
    return this.completed.has(`${kind}:${resourceId}`)
  }

  isResourceFailed(kind: SyncJobKind, resourceId: string): boolean {
    return this.failed.has(`${kind}:${resourceId}`)
  }

  getFailureReason(kind: SyncJobKind, resourceId: string): string | undefined {
    return this.failed.get(`${kind}:${resourceId}`)
  }
}
