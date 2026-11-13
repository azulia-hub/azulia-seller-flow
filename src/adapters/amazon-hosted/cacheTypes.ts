import type { SyncRange } from '../../core/sync/ranges'

export interface BrowserJob extends SyncRange {
  id: string
  scope: string
  kind: 'finance' | 'purchases' | 'order' | 'history' | 'catalog' | 'orderItems'
  updatedOnly?: boolean
  orderId?: string
  asin?: string
  nextToken: string | null
  createdAt: number
  state?: 'pending' | 'running' | 'completed' | 'retryLater' | 'failed'
  runId?: string
  failureReason?: string
  retries?: number
}
export interface CacheMeta {
  account: string; revision: number; updatedAt: string | null; lastSync: string | null
  coverage: SyncRange[]; purchaseCoverage: SyncRange[]; jobs: BrowserJob[]
  orderChecked: Record<string, number>; historyChecked: Record<string, number>; nextAllowed: Record<string, number>; dateFailures: Record<string, number>; catalogChecked: Record<string, number>; orderItemsChecked?: Record<string, number>
  issues: string[]; orderDateIssues: number; catalogError: string | null
  failedJobs?: Record<string, string>
  leaseOwner?: string | null; leaseUntil?: number
}
export interface CatalogValue { asin: string; title: string | null; imageUrl: string | null }
export const empty = (account: string): CacheMeta => ({ account, revision: 0, updatedAt: null, lastSync: null, coverage: [], purchaseCoverage: [], jobs: [], orderChecked: {}, historyChecked: {}, nextAllowed: {}, dateFailures: {}, catalogChecked: {}, orderItemsChecked: {}, issues: [], orderDateIssues: 0, catalogError: null })
