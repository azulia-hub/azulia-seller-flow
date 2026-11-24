import { TableToolbar } from './TableToolbar'
import { TablePagination } from './TablePagination'
import { PerformanceTable } from './PerformanceTable'
import type { AdvertisingEntity, AdvertisingViewQuery, AdvertisingWorkspaceModel } from '../contract'

interface CampaignsViewProps {
  readonly model: AdvertisingWorkspaceModel
  readonly formatMoney: (value: number) => string
  readonly onOpenEntity: (entity: AdvertisingEntity) => void
  readonly onQueryChange: (patch: Partial<AdvertisingViewQuery>) => void
}

export function CampaignsView({ model, formatMoney, onOpenEntity, onQueryChange }: CampaignsViewProps) {
  const { query, campaigns, totalRows, pageSize } = model
  return <div className="adsw-table-card" aria-label="Campaigns table">
    <TableToolbar query={query} onQueryChange={onQueryChange} searchPlaceholder="Search campaigns..." sortId="adsw-sort-campaigns" />
    <PerformanceTable rows={campaigns} kind="campaign" sorting={{ query: model.query, onQueryChange }} formatMoney={formatMoney} onOpenEntity={onOpenEntity} />
    <TablePagination page={query.page} totalRows={totalRows} pageSize={pageSize} visibleRows={campaigns.length} noun="campaigns" onPageChange={page => onQueryChange({ page })} />
  </div>
}
