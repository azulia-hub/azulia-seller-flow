import type { BuildAdvertisingWorkspaceInput } from './buildWorkspaceModel'
import { buildAdvertisingWorkspaceModel } from './buildWorkspaceModel'
import { enrichWorkspaceModel } from './enrichWorkspaceModel'
import { advertisingFinancialContext } from './financialContext'
import { previousEqualRange } from '../../core/analytics/timePeriods'
import type { AdsEntitySnapshot } from '../../adapters/amazon-ads/entities'

export interface AdvertisingCalculationInput extends Omit<BuildAdvertisingWorkspaceInput, 'financial' | 'previousFinancial'> {
  readonly entities?: AdsEntitySnapshot
  readonly skuAliases?: readonly (readonly [string, string])[]
  readonly financialInput: Omit<Parameters<typeof advertisingFinancialContext>[0], 'from' | 'to' | 'normalizeSku'>
}
/** Runs in a worker: financial preparation and all report/recommendation selectors. */
export function calculateAdvertisingWorkspace(input: AdvertisingCalculationInput) {
  const aliases = new Map(input.skuAliases)
  const normalizeSku = input.skuAliases ? (sku: string) => aliases.get(sku) ?? sku : undefined
  const financial = advertisingFinancialContext({ ...input.financialInput, normalizeSku, from: input.query.from, to: input.query.to })
  const previousFinancial = advertisingFinancialContext({ ...input.financialInput, normalizeSku, ...previousEqualRange(input.query) })
  const model = buildAdvertisingWorkspaceModel({ ...input, financial, previousFinancial })
  return enrichWorkspaceModel(model, input.source, input.supplemental ?? {}, input.entities, input.asOf, input.detailContext)
}
