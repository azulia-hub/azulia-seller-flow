import type { SponsoredProductsAttribution } from '../../core/advertising/sponsoredProducts'
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
import type { OrderCohort } from '../../core/analytics/orderLifecycle'
import type { SponsoredProductsReport } from '../../core/advertising/types'

type Props = {
  readonly dataset: CanonicalDataset | null; readonly rawDataset: RawDataset | null; readonly needsMapping: boolean
  readonly importing: boolean; readonly importError: string | null; readonly fileName: string
  readonly imports: readonly StoredImport[]; readonly currentImportId: string | null; readonly leftId: string; readonly rightId: string
  readonly comparison: ImportComparison | null; readonly formatMoney: (value: number) => string; readonly classificationRules: readonly ClassificationRule[]
  readonly qualityCenter: DataQualityCenterResult | null; readonly onQualityAction: (action: Exclude<QualityAction, null>) => void
  readonly cohort: OrderCohort | null; readonly reportMinDate?: string; readonly reportMaxDate?: string
  readonly sponsoredAttribution: SponsoredProductsAttribution
  readonly sponsoredReport: SponsoredProductsReport | null; readonly sponsoredImporting: boolean; readonly sponsoredError: string | null
  readonly onViewSponsored: () => void
  readonly onSponsoredFile: (file: File) => void | Promise<void>
  readonly onFile: (file: File) => void | Promise<void>; readonly onApplyMapping: (spec: MappingSpec) => void | Promise<void>
  readonly onLeftChange: (id: string) => void; readonly onRightChange: (id: string) => void; readonly onOpen: (item: StoredImport) => void
  readonly onSaveClassificationRule: (rule: ClassificationRule) => void; readonly onDeleteClassificationRule: (id: string) => void
}

export function ReportsPage(props: Props) {
  const quality = props.dataset?.quality
  return <>
    <PageHeader eyebrow="Reports" title="Manage your marketplace reports" description="Upload a new report, check that every rupee is accounted for, or compare saved reports over the same dates." action={<UploadZone onFile={props.onFile} loading={props.importing} />} />
    <section className="report-coverage-guide" aria-label="Recommended report coverage">
      <span className="coverage-guide-icon">↔</span>
      <div><strong>Include extra transaction history</strong><p>For reliable order profit, export at least 20 days before and 20 days after the period you want to analyze. This connects sales with later refunds, fee reversals and reimbursements.</p><details><summary>See an example</summary><div className="coverage-example"><b>Analyze</b><span>1–31 August</span><b>Upload</b><span>12 July–20 September</span><small>An August order refunded in September stays with August. An August refund whose original July sale is missing is excluded from the sales-period view, but remains in posted activity.</small></div></details></div>
    </section>
    <section className="report-guide" aria-label="Report import steps"><div className="done"><b>1</b><span><strong>Choose report</strong><small>CSV or TSV file</small></span></div><i /><div className={props.dataset || props.rawDataset ? 'done' : ''}><b>2</b><span><strong>Check data</strong><small>Columns and money</small></span></div><i /><div className={props.dataset ? 'done' : ''}><b>3</b><span><strong>Ready</strong><small>Explore results</small></span></div></section>
    {props.importError ? <section className="notice-card danger" role="alert"><span>!</span><div><strong>We could not import that file</strong><p>{props.importError}</p></div></section> : null}
    <section className="panel report-status-card"><div className="report-status-main"><span className="file-badge">CSV</span><div><small>Current report</small><h3>{props.dataset || props.rawDataset ? props.fileName : 'No report selected'}</h3><p>{quality ? `${quality.sourceRowCount.toLocaleString('en-IN')} rows processed into ${quality.normalizedEventCount.toLocaleString('en-IN')} transactions` : 'Choose a marketplace CSV or TSV report to begin.'}</p></div></div>{quality ? <div className="report-checks"><span className={quality.reconciliation.reconciled ? 'good' : 'warning'}><b>{quality.reconciliation.reconciled ? '✓' : '!'}</b>{quality.reconciliation.reconciled ? 'Financial totals match the source report' : 'Financial totals need review'}</span><span className={quality.unclassifiedEventCount ? 'warning' : 'good'}><b>{quality.unclassifiedEventCount ? '!' : '✓'}</b>{quality.unclassifiedEventCount ? `${quality.unclassifiedEventCount} transactions need review` : 'All transactions classified'}</span></div> : null}</section>
    <section className="panel sponsored-upload-card">
      <div><small>Advertising performance</small><h3>Sponsored Products report</h3><p>Upload the Advertised product XLSX to see sales credited to ads and reported spend. The financial report supplies total business sales, booked advertising expense and business profit.</p></div>
      <label className="upload-mini"><span className="upload-icon">↑</span><span><strong>{props.sponsoredImporting ? 'Importing…' : props.sponsoredReport ? 'Replace ads report' : 'Import ads report'}</strong><small>Amazon Advertised product · XLSX</small></span><input hidden type="file" accept=".xlsx,.xls" disabled={props.sponsoredImporting} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void props.onSponsoredFile(file) }} /></label>
      {props.sponsoredReport ? <div className="sponsored-file-status"><span className="status good">Advertising report imported</span>{props.sponsoredAttribution.status === 'AVAILABLE' ? <small>{props.sponsoredAttribution.skus.length} financial products matched · {props.sponsoredAttribution.unmatched.length} advertised SKUs unmatched for {props.sponsoredAttribution.selectedFrom} – {props.sponsoredAttribution.selectedTo}</small> : <small>Choose shared dates to review product matching. An imported report does not mean every SKU is matched.</small>}<strong>{props.sponsoredReport.fileName}</strong><small>{props.sponsoredReport.minDate} → {props.sponsoredReport.maxDate} · {props.sponsoredReport.rows.length.toLocaleString('en-IN')} daily rows</small><button className="secondary" onClick={props.onViewSponsored}>View shared dates</button></div> : null}
      {props.sponsoredError ? <div className="notice-card danger" role="alert"><span>!</span><div><strong>Ads report was not imported</strong><p>{props.sponsoredError}</p></div></div> : null}
    </section>
    {props.dataset && props.cohort ? <section className="lifecycle-coverage-card"><header><div><small>Sales-period evidence</small><strong>{props.reportMinDate} → {props.reportMaxDate}</strong></div><span>{props.cohort.orders.length} orders selected</span></header><p>All known sales-period orders are included without a maturity cutoff. Pending activity is separate from released results.</p><div className="lifecycle-coverage-grid"><div><b>{props.cohort.pendingOrderCount}</b><small>orders with pending activity</small></div><div><b>{props.cohort.limitedFollowUpOrderCount}</b><small>orders with limited follow-up, still included</small></div><div><b>{props.cohort.missingSale.length}</b><small>original sale missing</small></div></div></section> : null}
    {props.needsMapping && props.rawDataset ? <MappingPanel dataset={props.rawDataset} onApply={props.onApplyMapping} /> : null}
    {props.qualityCenter ? <DataQualityCenter result={props.qualityCenter} formatMoney={props.formatMoney} onAction={props.onQualityAction} /> : null}
    {props.dataset ? <div id="classification-review"><TransactionReviewManager dataset={props.dataset} rules={props.classificationRules} formatMoney={props.formatMoney} onSaveRule={props.onSaveClassificationRule} onDeleteRule={props.onDeleteClassificationRule} /></div> : null}
    <div className="section-heading"><div><small>Saved in this browser</small><h2>Previous reports</h2></div><p>Reopen an earlier report or compare two reports without mixing their date ranges.</p></div>
    <div id="report-comparison"><ImportHistory imports={props.imports} currentImportId={props.currentImportId} leftId={props.leftId} rightId={props.rightId} comparison={props.comparison} formatMoney={props.formatMoney} onLeftChange={props.onLeftChange} onRightChange={props.onRightChange} onOpen={props.onOpen} embedded /></div>
  </>
}
