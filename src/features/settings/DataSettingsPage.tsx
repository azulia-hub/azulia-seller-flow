import { ReviewSettingsPanel } from '../review-requests/ReviewSettingsPanel'
import { PreferenceControls } from './PreferenceControls'
import type { AppPreferences } from '../../core/settings/preferences'
import type { ReactNode } from 'react'
import { AndroidSettings } from './AndroidSettings'
import { InstallCard } from '../../adapters/browser/pwa'
import type { MissingCostPolicy } from '../../core/costs/calculateCosts'
import type { ProductCost } from '../../core/costs/types'
import { PageHeader } from '../../components/PageHeader'
import { BackupRestore } from './BackupRestore'

type Props = { readonly preferences:AppPreferences; readonly onPreferencesChange:(patch:Partial<AppPreferences>)=>void; readonly coverage?: ReactNode; readonly costs: readonly ProductCost[]; readonly missingCostPolicy: MissingCostPolicy; readonly importCount: number; readonly ruleCount: number; readonly reviewRunDate?: string | null; readonly focusSyncStatus?: boolean; readonly onMissingCostPolicyChange: (policy: MissingCostPolicy) => void; readonly onExportBackup: () => void; readonly onRestoreBackup: (file: File) => Promise<void> }

export function DataSettingsPage(props: Props) {
  return <>
    <PageHeader eyebrow="Data & Settings" title="Settings" description="Calculation preferences, local backup and data protection." />
    <nav className="workspace-section-links" aria-label="Settings sections">
      <a href="#settings-preferences">Preferences</a>
      <a href="#settings-sync">Sync & reviews</a>
      <a href="#settings-calculations">Calculations</a>
      <a href="#settings-backup">Backup</a>
    </nav>
    <section id="settings-preferences" className="workspace-section-anchor" aria-labelledby="settings-preferences-name">
      <h2 id="settings-preferences-name">Preferences</h2>
      <PreferenceControls value={props.preferences} onChange={props.onPreferencesChange} />
    </section>
    <section id="settings-sync" className="workspace-section-anchor" aria-labelledby="settings-sync-name">
      <h2 id="settings-sync-name">Sync & reviews</h2>
      {props.coverage}
      <AndroidSettings focused={props.focusSyncStatus} />
      <ReviewSettingsPanel initialDate={props.reviewRunDate ?? undefined} />
    </section>
    <section id="settings-calculations" className="panel settings-preferences workspace-section-anchor" aria-labelledby="settings-calculations-name">
      <h2 id="settings-calculations-name">Calculation preferences</h2>
      <label className="cost-policy">
        <input type="checkbox" checked={props.missingCostPolicy === 'ASSUME_ZERO'} onChange={event =>
          props.onMissingCostPolicyChange(event.target.checked ? 'ASSUME_ZERO' : 'BLOCK')} />
        <span><strong>Assume ₹0 for missing cost periods</strong>
          <small>Profit remains visibly estimated. Product advertising contribution still requires cost coverage.</small></span>
      </label>
      <p>Manage dated costs in Product costs or directly inside a product profile.</p>
    </section>
    <section id="settings-backup" className="workspace-section-anchor" aria-label="Backup and installation">
      <BackupRestore importCount={props.importCount} costCount={props.costs.length} ruleCount={props.ruleCount} onExport={props.onExportBackup} onRestore={props.onRestoreBackup} />
      <InstallCard />
    </section>
  </>
}
