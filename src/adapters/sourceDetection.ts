import { detectSource } from '../core/adapters/sourceAdapter'
import type { RawDataset } from '../core/data/types'
import { amazonUnifiedTransactionAdapter } from './amazon/unifiedTransactionAdapter'

export const sourceAdapters = [amazonUnifiedTransactionAdapter] as const

export function autoDetectSource(input: RawDataset) {
  return detectSource(input, sourceAdapters)
}
