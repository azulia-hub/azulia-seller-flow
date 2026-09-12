import type { CanonicalDataset, RawDataset } from '../../core/data/types'
import type { MappingSpec } from '../../core/normalize/types'
import type { ImportComparison, StoredImport } from '../../core/imports/importHistory'
import { PageHeader } from '../../components/PageHeader'
import { UploadZone } from '../upload/UploadZone'
import { MappingPanel } from '../upload/MappingPanel'
import { ImportHistory } from '../imports/ImportHistory'
import type { ClassificationRule } from '../../core/classification/types'
import { TransactionReviewManager } from '../data-quality/TransactionReviewManager'
import type { DataQualityCenterResult, QualityAction } from '../../core/validation/dataQualityCenter'
import { DataQualityCenter } from '../data-quality/DataQualityCenter'

type Props = {
  readonly dataset: CanonicalDataset | null; readonly rawDataset: RawDataset | null; readonly needsMapping: boolean
  readonly importing: boolean; readonly importError: string | null; readonly fileName: string
  readonly imports: readonly StoredImport[]; readonly currentImportId: string | null; readonly leftId: string; readonly rightId: string
  readonly comparison: ImportComparison | null; readonly formatMoney: (value: number) => string; readonly classificationRules: readonly ClassificationRule[]
  readonly qualityCenter: DataQualityCenterResult | null; readonly onQualityAction: (action: Exclude<QualityAction, null>) => void
  readonly onFile: (file: File) => void | Promise<void>; readonly onApplyMapping: (spec: MappingSpec) => void | Promise<void>
  readonly onLeftChange: (id: string) => void; readonly onRightChange: (id: string) => void; readonly onOpen: (item: StoredImport) => void
  readonly onSaveClassificationRule: (rule: ClassificationRule) => void; readonly onDeleteClassificationRule: (id: string) => void
}

export function ReportsPage(props: Props) {
  const quality = props.dataset?.quality
  return <>
    <PageHeader eyebrow="Reports" title="Manage your marketplace reports" description="Upload a new report, check that every rupee is accounted for, or compare saved reports over the same dates." action={<UploadZone onFile={props.onFile} loading={props.importing} />} />
    <section className="report-guide" aria-label="Report import steps"><div className="done"><b>1</b><span><strong>Choose report</strong><small>CSV or TSV file</small></span></div><i /><div className={props.dataset || props.rawDataset ? 'done' : ''}><b>2</b><span><strong>Check data</strong><small>Columns and money</small></span></div><i /><div className={props.dataset ? 'done' : ''}><b>3</b><span><strong>Ready</strong><small>Explore results</small></span></div></section>
    {props.importError ? <section className="notice-card danger" role="alert"><span>!</span><div><strong>We could not import that file</strong><p>{props.importError}</p></div></section> : null}
    <section className="panel report-status-card"><div className="report-status-main"><span className="file-badge">CSV</span><div><small>Current report</small><h3>{props.dataset || props.rawDataset ? props.fileName : 'No report selected'}</h3><p>{quality ? `${quality.sourceRowCount.toLocaleString('en-IN')} rows processed into ${quality.normalizedEventCount.toLocaleString('en-IN')} transactions` : 'Choose a marketplace CSV or TSV report to begin.'}</p></div></div>{quality ? <div className="report-checks"><span className={quality.reconciliation.reconciled ? 'good' : 'warning'}><b>{quality.reconciliation.reconciled ? '✓' : '!'}</b>{quality.reconciliation.reconciled ? 'Report accuracy check passed' : 'Review report accuracy'}</span><span className={quality.unclassifiedEventCount ? 'warning' : 'good'}><b>{quality.unclassifiedEventCount ? '!' : '✓'}</b>{quality.unclassifiedEventCount ? `${quality.unclassifiedEventCount} transactions need review` : 'All transactions classified'}</span></div> : null}</section>
    {props.needsMapping && props.rawDataset ? <MappingPanel dataset={props.rawDataset} onApply={props.onApplyMapping} /> : null}
    {props.qualityCenter ? <DataQualityCenter result={props.qualityCenter} formatMoney={props.formatMoney} onAction={props.onQualityAction} /> : null}
    {props.dataset ? <div id="classification-review"><TransactionReviewManager dataset={props.dataset} rules={props.classificationRules} formatMoney={props.formatMoney} onSaveRule={props.onSaveClassificationRule} onDeleteRule={props.onDeleteClassificationRule} /></div> : null}
    <div className="section-heading"><div><small>Saved in this browser</small><h2>Previous reports</h2></div><p>Reopen an earlier report or compare two reports without mixing their date ranges.</p></div>
    <div id="report-comparison"><ImportHistory imports={props.imports} currentImportId={props.currentImportId} leftId={props.leftId} rightId={props.rightId} comparison={props.comparison} formatMoney={props.formatMoney} onLeftChange={props.onLeftChange} onRightChange={props.onRightChange} onOpen={props.onOpen} embedded /></div>
  </>
}
