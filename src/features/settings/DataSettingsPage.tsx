import type { CanonicalFinancialEvent } from '../../core/data/types'
import type { MissingCostPolicy } from '../../core/costs/calculateCosts'
import type { ProductCost } from '../../core/costs/types'
import { PageHeader } from '../../components/PageHeader'
import { CostMaster } from '../costs/CostMaster'
import { BackupRestore } from './BackupRestore'

type Props = { readonly events: readonly CanonicalFinancialEvent[]; readonly costs: readonly ProductCost[]; readonly missingCostPolicy: MissingCostPolicy; readonly normalizeSku?: (sku: string) => string; readonly importCount: number; readonly ruleCount: number; readonly onSaveCosts: (costs: ProductCost[]) => void; readonly onMissingCostPolicyChange: (policy: MissingCostPolicy) => void; readonly onExportBackup: () => void; readonly onRestoreBackup: (file: File) => Promise<void> }

export function DataSettingsPage(props: Props) {
  return <><PageHeader eyebrow="Data & Settings" title="Keep your profit calculations accurate" description="Manage product costs and calculation preferences. Everything is stored privately in this browser." /><section className="settings-intro-grid"><article><span className="settings-icon">₹</span><div><strong>Product costs</strong><p>Add costs manually, paste from a spreadsheet, or upload a cost file.</p></div></article><article><span className="settings-icon">✓</span><div><strong>Calculation safety</strong><p>Missing costs remain clearly marked wherever profit is shown.</p></div></article><article><span className="settings-icon">⌂</span><div><strong>Local storage</strong><p>Your business reports are not sent to an external server.</p></div></article></section><BackupRestore importCount={props.importCount} costCount={props.costs.length} ruleCount={props.ruleCount} onExport={props.onExportBackup} onRestore={props.onRestoreBackup} /><CostMaster events={props.events} costs={props.costs} onSave={props.onSaveCosts} missingCostPolicy={props.missingCostPolicy} onMissingCostPolicyChange={props.onMissingCostPolicyChange} normalizeSku={props.normalizeSku} /></>
}
