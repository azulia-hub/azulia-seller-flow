import { PreferenceControls } from './PreferenceControls'
import type { AppPreferences } from '../../core/settings/preferences'
import type { ReactNode } from 'react'
import { AndroidSettings } from './AndroidSettings'
import { InstallCard } from '../../adapters/browser/pwa'
import type { MissingCostPolicy } from '../../core/costs/calculateCosts'
import type { ProductCost } from '../../core/costs/types'
import { PageHeader } from '../../components/PageHeader'
import { BackupRestore } from './BackupRestore'

type Props = { readonly preferences:AppPreferences; readonly onPreferencesChange:(patch:Partial<AppPreferences>)=>void; readonly coverage?: ReactNode; readonly costs: readonly ProductCost[]; readonly missingCostPolicy: MissingCostPolicy; readonly importCount: number; readonly ruleCount: number; readonly onMissingCostPolicyChange: (policy: MissingCostPolicy) => void; readonly onExportBackup: () => void; readonly onRestoreBackup: (file: File) => Promise<void> }

export function DataSettingsPage(props: Props) {
  return <><PageHeader eyebrow="Data & Settings" title="Settings" description="Calculation preferences, local backup and data protection." />{props.coverage}<PreferenceControls value={props.preferences} onChange={props.onPreferencesChange} /><AndroidSettings /><section className="panel settings-preferences"><h3>Calculation preferences</h3><label className="cost-policy"><input type="checkbox" checked={props.missingCostPolicy === 'ASSUME_ZERO'} onChange={event => props.onMissingCostPolicyChange(event.target.checked ? 'ASSUME_ZERO' : 'BLOCK')} /><span><strong>Assume ₹0 for missing cost periods</strong><small>Profit remains visibly estimated. Product advertising contribution still requires cost coverage.</small></span></label><p>Unit costs and dated history are managed in Product costs, or directly inside a product profile.</p></section><InstallCard /><BackupRestore importCount={props.importCount} costCount={props.costs.length} ruleCount={props.ruleCount} onExport={props.onExportBackup} onRestore={props.onRestoreBackup} /></>
}
