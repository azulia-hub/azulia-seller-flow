import type { SyncRange } from '../../core/sync/ranges'
export interface SyncStatus {
  onDemand?: boolean
  connectionKey: string; configured: boolean; revision: number; records: number; missingWindows: number; coverage: SyncRange[]
  state: 'idle' | 'syncing' | 'waiting' | 'error'; lastSync: string | null; nextAttempt: string | null; error: string | null
  catalogPending?: number; catalogError?: string | null
  orderDateIssues?: number; pendingOrderDates?: number; pendingOrderCycles?: number; purchaseHistoryPending?: number; orderDatesSyncing?: boolean; orderDatesError?: string | null
}
/** Allowlisted Orders metadata; no buyer/address information. */
export interface SourceOrderSummary { id: string; purchased: string; status: string | null; fulfillmentType: string | null; orderValue: string | null; currency: string | null }
export interface SyncSnapshot { issues?: string[]; orders?: SourceOrderSummary[]; delta?: boolean; connectionKey: string; revision: number; updatedAt: string | null; records: Record<string, unknown>[]; coverage: SyncRange[] }
