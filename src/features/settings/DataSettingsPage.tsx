import type { CanonicalFinancialEvent } from '../../core/data/types'
import type { MissingCostPolicy } from '../../core/costs/calculateCosts'
import type { ProductCost } from '../../core/costs/types'
import { PageHeader } from '../../components/PageHeader'
import { BackupRestore } from './BackupRestore'

type Props = { readonly events: readonly CanonicalFinancialEvent[]; readonly costs: readonly ProductCost[]; readonly missingCostPolicy: MissingCostPolicy; readonly normalizeSku?: (sku: string) => string; readonly importCount: number; readonly ruleCount: number; readonly onSaveCosts: (costs: ProductCost[]) => void; readonly onMissingCostPolicyChange: (policy: MissingCostPolicy) => void; readonly onExportBackup: () => void; readonly onRestoreBackup: (file: File) => Promise<void> }

export function DataSettingsPage(props: Props) {
  return <><PageHeader eyebrow="Data & Settings" title="Settings" description="Calculation preferences, local backup and data protection." /><section className="panel settings-preferences"><h3>Calculation preferences</h3><label className="cost-policy"><input type="checkbox" checked={props.missingCostPolicy === 'ASSUME_ZERO'} onChange={event => props.onMissingCostPolicyChange(event.target.checked ? 'ASSUME_ZERO' : 'BLOCK')} /><span><strong>Assume ₹0 for missing cost periods</strong><small>Profit remains visibly estimated. Product advertising contribution still requires cost coverage.</small></span></label><p>Unit costs and dated history are managed in Product costs, or directly inside a product profile.</p></section><BackupRestore importCount={props.importCount} costCount={props.costs.length} ruleCount={props.ruleCount} onExport={props.onExportBackup} onRestore={props.onRestoreBackup} /></>
}
