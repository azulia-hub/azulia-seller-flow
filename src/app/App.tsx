import { useEffect, useMemo, useState } from 'react'
import { KpiCard } from '../components/KpiCard'
import { LineChart } from '../components/LineChart'
import { BarChart } from '../components/BarChart'
import { parseCsvDataset } from '../core/csv/parseCsv'
import type { CanonicalDataset } from '../core/data/types'
import type { RawDataset } from '../core/data/types'
import type { MappingSpec } from '../core/normalize/types'
import { normalizeDataset } from '../core/normalize/normalizeDataset'
import { autoDetectSource } from '../adapters/sourceDetection'
import { canonicalDateKey, dailySales, filterEvents, summarizeDashboard, summarizeProducts } from '../core/analytics/dashboardSummary'
import { calculateCosts } from '../core/costs/calculateCosts'
import type { MissingCostPolicy } from '../core/costs/calculateCosts'
import type { ProductCost } from '../core/costs/types'
import { loadProductCosts, saveProductCosts } from '../adapters/browser/costStore'
import { normalizeAmazonSku } from '../adapters/amazon/unifiedTransactionAdapter'
import { ProfitBridge } from '../components/ProfitBridge'
import { summarizeOrders, summarizeProductPortfolio, summarizeProductProfitability, summarizeSkuProfit } from '../core/analytics/orderProfit'
import { calculateUnitEconomics } from '../core/analytics/unitEconomics'
import { summarizeReturns } from '../core/analytics/returnSummary'
import { ReturnAnalysis } from '../features/returns/ReturnAnalysis'
import { compareImports, profileDataset, type StoredImport } from '../core/imports/importHistory'
import { loadImports, saveImport } from '../adapters/browser/importStore'
import { ProductProfitability } from '../features/products/ProductProfitability'
import { AppShell } from './AppShell'
import type { AppPage } from './navigation'
import { GlobalFilters } from '../components/GlobalFilters'
import { PageHeader } from '../components/PageHeader'
import { ReportsPage } from '../features/reports/ReportsPage'
import { DataSettingsPage } from '../features/settings/DataSettingsPage'
import { ReportRequired } from '../components/ReportRequired'
import { applyClassificationRules, classificationRuleKey } from '../core/classification/classificationRules'
import type { ClassificationRule } from '../core/classification/types'
import { loadClassificationRules, saveClassificationRules } from '../adapters/browser/classificationRuleStore'
import { buildAdvertisingSkuInsight, filterAdvertisingScope, summarizeAdvertising } from '../core/analytics/advertisingSummary'
import { AdvertisingAnalysis } from '../features/advertising/AdvertisingAnalysis'
import { AdvertisingSkuDrilldown } from '../features/advertising/AdvertisingSkuDrilldown'
import { buildMetricSkuDrilldown, type MetricDrilldownId } from '../core/analytics/metricDrilldown'
import { MetricSkuDrilldown } from '../components/MetricSkuDrilldown'
import { TIME_PERIOD_OPTIONS, previousEqualRange, rangeCoverage, recommendTimePeriod, resolveTimePeriod, type TimePeriodPreset } from '../core/analytics/timePeriods'
import { buildDataQualityCenter, type QualityAction } from '../core/validation/dataQualityCenter'
import { buildFeeAudit } from '../core/analytics/feeAudit'
import { FeeAuditPanel } from '../features/fees/FeeAuditPanel'
import { buildAuditWorkbook } from '../core/export/auditWorkbook'
import { downloadWorkbook } from '../adapters/browser/downloadWorkbook'
import { downloadBackup, restoreBackup } from '../adapters/browser/backupStore'

type PeriodChoice = TimePeriodPreset | 'CUSTOM'

function money(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

export function App() {
  const [active, setActive] = useState<AppPage>('Home')
  const [mobileNav, setMobileNav] = useState(false)
  const [fileName, setFileName] = useState('August 2026 Amazon report')
  const [dataset, setDataset] = useState<CanonicalDataset | null>(null)
  const [rawDataset, setRawDataset] = useState<RawDataset | null>(null)
  const [needsMapping, setNeedsMapping] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [fulfillmentFilter, setFulfillmentFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [periodChoice, setPeriodChoice] = useState<PeriodChoice | ''>('')
  const [costs, setCosts] = useState<ProductCost[]>(() => loadProductCosts())
  const [missingCostPolicy, setMissingCostPolicy] = useState<MissingCostPolicy>('ASSUME_ZERO')
  const [drilldownSku, setDrilldownSku] = useState<string | undefined>()
  const [advertisingDrilldownOpen, setAdvertisingDrilldownOpen] = useState(false)
  const [homeMetric, setHomeMetric] = useState<MetricDrilldownId | null>(null)
  const [imports, setImports] = useState<StoredImport[]>([])
  const [currentImportId, setCurrentImportId] = useState<string | null>(null)
  const [comparisonLeftId, setComparisonLeftId] = useState('')
  const [comparisonRightId, setComparisonRightId] = useState('')
  const [classificationRules, setClassificationRules] = useState<ClassificationRule[]>(() => loadClassificationRules())
  const [adAccountType, setAdAccountType] = useState('')
  const [adFulfillmentType, setAdFulfillmentType] = useState('')
  const [feeAuditOpen, setFeeAuditOpen] = useState(false)

  useEffect(() => {
    loadImports().then((saved) => {
      setImports(saved)
      setComparisonLeftId(saved[0]?.id ?? '')
      setComparisonRightId(saved[1]?.id ?? saved[0]?.id ?? '')
    }).catch((error) => setImportError(error instanceof Error ? error.message : 'Could not load import history.'))
  }, [])

  const effectiveDataset = useMemo(() => dataset ? applyClassificationRules(dataset, classificationRules) : null, [dataset, classificationRules])
  const allEvents = effectiveDataset?.events ?? []
  const periodScopeEvents = useMemo(() => filterEvents(allEvents, { fulfillmentType: fulfillmentFilter || undefined }), [allEvents, fulfillmentFilter])
  const filteredEvents = useMemo(() => filterEvents(periodScopeEvents, { fromDate: fromDate || undefined, toDate: toDate || undefined }), [periodScopeEvents, fromDate, toDate])
  const summary = useMemo(() => summarizeDashboard(filteredEvents), [filteredEvents])
  const products = useMemo(() => summarizeProducts(filteredEvents), [filteredEvents])
  const skuNormalizer = dataset?.source === 'amazon' ? normalizeAmazonSku : undefined
  const costStatus = useMemo(() => calculateCosts(filteredEvents, costs, missingCostPolicy, skuNormalizer), [filteredEvents, costs, missingCostPolicy, skuNormalizer])
  const trend = useMemo(() => dailySales(filteredEvents), [filteredEvents])
  const accountTypes = useMemo(() => [...new Set(allEvents.flatMap((event) => event.accountType ? [event.accountType] : []))].sort(), [allEvents])
  const fulfillmentTypes = useMemo(() => [...new Set(allEvents.flatMap((event) => event.fulfillmentType ? [event.fulfillmentType] : []))].sort(), [allEvents])
  const dateExtent = useMemo(() => {
    const dates = allEvents.flatMap((event) => { const date = canonicalDateKey(event.date); return date ? [date] : [] }).sort()
    return { min: dates[0], max: dates.at(-1) }
  }, [allEvents])
  const comparisonPeriods = useMemo(() => {
    if (!dateExtent.min || !dateExtent.max) return []
    return TIME_PERIOD_OPTIONS.filter(option => {
      const period = resolveTimePeriod(option.id, dateExtent.max!)
      return rangeCoverage(period.current, dateExtent.min!, dateExtent.max!) === 'Full coverage' && rangeCoverage(period.previous, dateExtent.min!, dateExtent.max!) === 'Full coverage'
    })
  }, [dateExtent.min, dateExtent.max])
  useEffect(() => {
    if (!dateExtent.min || !dateExtent.max) return
    if (periodChoice === 'CUSTOM') return
    const recommended = recommendTimePeriod(dateExtent.min, dateExtent.max)
    const next = comparisonPeriods.some(option => option.id === periodChoice)
      ? periodChoice as TimePeriodPreset
      : comparisonPeriods.find(option => option.id === recommended)?.id ?? comparisonPeriods.at(-1)?.id
    if (next) {
      const current = resolveTimePeriod(next, dateExtent.max).current
      setPeriodChoice(next)
      setFromDate(current.from)
      setToDate(current.to)
    } else {
      setPeriodChoice('CUSTOM')
      setFromDate(dateExtent.min)
      setToDate(dateExtent.max)
    }
  }, [dateExtent.min, dateExtent.max, comparisonPeriods, periodChoice])

  function applyPeriod(next: PeriodChoice) {
    setPeriodChoice(next)
    if (next !== 'CUSTOM' && dateExtent.max) {
      const current = resolveTimePeriod(next, dateExtent.max).current
      setFromDate(current.from)
      setToDate(current.to)
    }
  }
  const profitAfterAds = summary.operatingNet - costStatus.netCogs
  const profitBeforeAds = profitAfterAds + summary.adsSpend
  const profitMargin = summary.grossSales ? profitAfterAds / summary.grossSales * 100 : 0
  const roi = costStatus.netCogs ? profitAfterAds / costStatus.netCogs * 100 : 0
  const unitEconomics = calculateUnitEconomics({ grossSales: summary.grossSales, netDeliveredQuantity: summary.netDeliveredQuantity, profitAfterAds, adsSpend: summary.adsSpend, profitReady: costStatus.profitReady })
  const explainedOperating = summary.grossSales - summary.refundValue - summary.marketplaceCharges - summary.netEasyShipFee - summary.adsSpend + summary.reimbursements + summary.taxNet
  const otherOperating = summary.operatingNet - explainedOperating
  const orders = useMemo(() => summarizeOrders(filteredEvents, costs, missingCostPolicy, skuNormalizer), [filteredEvents, costs, missingCostPolicy, skuNormalizer])
  const returnSummary = useMemo(() => summarizeReturns(filteredEvents, costs, skuNormalizer), [filteredEvents, costs, skuNormalizer])
  const productProfitability = useMemo(() => summarizeProductProfitability(filteredEvents, costs, missingCostPolicy, skuNormalizer), [filteredEvents, costs, missingCostPolicy, skuNormalizer])
  const comparisonProductProfitability = useMemo(() => summarizeProductProfitability(periodScopeEvents, costs, missingCostPolicy, skuNormalizer), [periodScopeEvents, costs, missingCostPolicy, skuNormalizer])
  const previousRange = useMemo(() => {
    if (periodChoice === 'CUSTOM' && fromDate && toDate) return previousEqualRange({ from: fromDate, to: toDate })
    return periodChoice && periodChoice !== 'CUSTOM' && dateExtent.max ? resolveTimePeriod(periodChoice, dateExtent.max).previous : undefined
  }, [periodChoice, fromDate, toDate, dateExtent.max])
  const previousEvents = useMemo(() => previousRange ? filterEvents(periodScopeEvents, { fromDate: previousRange.from, toDate: previousRange.to }) : [], [periodScopeEvents, previousRange])
  const previousProductProfitability = useMemo(() => summarizeProductProfitability(previousEvents, costs, missingCostPolicy, skuNormalizer), [previousEvents, costs, missingCostPolicy, skuNormalizer])
  const previousOrders = useMemo(() => summarizeOrders(previousEvents, costs, missingCostPolicy, skuNormalizer), [previousEvents, costs, missingCostPolicy, skuNormalizer])
  const feeAudit = useMemo(() => buildFeeAudit(orders, previousOrders), [orders, previousOrders])
  const productPortfolio = useMemo(() => summarizeProductPortfolio(productProfitability, filteredEvents), [productProfitability, filteredEvents])
  const customComparisonRange = useMemo(() => periodChoice === 'CUSTOM' && fromDate && toDate ? { current: { from: fromDate, to: toDate }, previous: previousEqualRange({ from: fromDate, to: toDate }) } : undefined, [periodChoice, fromDate, toDate])
  const homeMetricResult = useMemo(() => homeMetric ? buildMetricSkuDrilldown(homeMetric, productProfitability, filteredEvents, comparisonProductProfitability, customComparisonRange) : null, [homeMetric, productProfitability, filteredEvents, comparisonProductProfitability, customComparisonRange])
  const advertisingEvents = useMemo(() => filterAdvertisingScope(filteredEvents, { accountType: adAccountType || undefined, fulfillmentType: adFulfillmentType || undefined }), [filteredEvents, adAccountType, adFulfillmentType])
  const advertisingSummary = useMemo(() => summarizeAdvertising(advertisingEvents), [advertisingEvents])
  const advertisingSkuProfit = useMemo(() => drilldownSku ? summarizeSkuProfit(advertisingEvents, drilldownSku, costs, missingCostPolicy, skuNormalizer) : undefined, [advertisingEvents, drilldownSku, costs, missingCostPolicy, skuNormalizer])
  const advertisingSkuInsight = useMemo(() => {
    const advertising = advertisingSummary.skus.find((item) => item.sku === drilldownSku)
    return advertising && advertisingSkuProfit ? buildAdvertisingSkuInsight(advertising, advertisingSkuProfit) : undefined
  }, [advertisingSummary.skus, drilldownSku, advertisingSkuProfit])
  const importComparison = useMemo(() => {
    const left = imports.find((item) => item.id === comparisonLeftId)
    const right = imports.find((item) => item.id === comparisonRightId)
    if (!left || !right) return null
    return compareImports(left, right, costs, missingCostPolicy, (source, sku) => source === 'amazon' ? normalizeAmazonSku(sku) : sku)
  }, [imports, comparisonLeftId, comparisonRightId, costs, missingCostPolicy])
  const qualityCenter = useMemo(() => effectiveDataset ? buildDataQualityCenter(effectiveDataset, costs, imports, currentImportId, skuNormalizer) : null, [effectiveDataset, costs, imports, currentImportId, skuNormalizer])
  const openOrders = (sku?: string) => { setDrilldownSku(sku); setHomeMetric('GROSS_SALES') }
  const openAdvertisingSku = (sku: string) => { setDrilldownSku(sku); setAdvertisingDrilldownOpen(true) }

  async function rememberImport(nextDataset: CanonicalDataset, nextFileName: string) {
    const item: StoredImport = { id: nextDataset.events[0]?.sourceDatasetId ?? crypto.randomUUID(), fileName: nextFileName, importedAt: new Date().toISOString(), dataset: nextDataset, profile: profileDataset(nextDataset) }
    await saveImport(item)
    setImports((current) => [item, ...current.filter((saved) => saved.id !== item.id)])
    setCurrentImportId(item.id)
    setComparisonLeftId(item.id)
    setComparisonRightId((current) => current || item.id)
  }

  function openImport(item: StoredImport) {
    setDataset(item.dataset)
    setRawDataset(null)
    setNeedsMapping(false)
    setFileName(item.fileName)
    setCurrentImportId(item.id)
    setFulfillmentFilter(''); setFromDate(''); setToDate(''); setPeriodChoice(''); setAdAccountType(''); setAdFulfillmentType('')
    setActive('Home')
  }

  async function onFile(file: File) {
    setImporting(true)
    setImportError(null)
    try {
      const raw = parseCsvDataset(await file.text(), crypto.randomUUID(), file.name)
      if (raw.rows.length === 0 || raw.headers.length === 0) throw new Error('The CSV has no data rows to import.')
      const detected = autoDetectSource(raw)
      setFileName(file.name)
      setRawDataset(raw)
      setFulfillmentFilter('')
      setFromDate('')
      setToDate('')
      setPeriodChoice('')
      setAdAccountType('')
      setAdFulfillmentType('')
      if (detected) {
        const normalized = detected.adapter.normalize(raw)
        setDataset(normalized)
        setNeedsMapping(false)
        await rememberImport(normalized, file.name)
      } else {
        setDataset(null)
        setNeedsMapping(true)
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'The CSV could not be imported.')
    } finally {
      setImporting(false)
    }
  }

  async function applyMapping(spec: MappingSpec) {
    if (!rawDataset) return
    const normalized = normalizeDataset(rawDataset, spec)
    setDataset(normalized)
    setNeedsMapping(false)
    try { await rememberImport(normalized, rawDataset.name) } catch (error) { setImportError(error instanceof Error ? error.message : 'Could not save import history.') }
  }

  function updateCosts(next: ProductCost[]) {
    saveProductCosts(next)
    setCosts(next)
  }

  function saveRule(rule: ClassificationRule) {
    const key = classificationRuleKey(rule.source, rule.rawType)
    const next = [...classificationRules.filter((item) => classificationRuleKey(item.source, item.rawType) !== key), rule]
    saveClassificationRules(next)
    setClassificationRules(next)
  }

  function deleteRule(id: string) {
    const next = classificationRules.filter((rule) => rule.id !== id)
    saveClassificationRules(next)
    setClassificationRules(next)
  }

  function handleQualityAction(action: Exclude<QualityAction, null>) {
    if (action === 'MANAGE_COSTS') { setActive('Data & Settings'); return }
    const target = action === 'REVIEW_CLASSIFICATION' ? 'classification-review' : action === 'COMPARE_REPORTS' ? 'report-comparison' : 'quality-center-title'
    requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function exportAuditWorkbook() {
    if (!effectiveDataset) return
    downloadWorkbook(buildAuditWorkbook({ dataset: effectiveDataset, events: filteredEvents, costs, missingCostPolicy, fileName, fromDate: fromDate || undefined, toDate: toDate || undefined, fulfillmentType: fulfillmentFilter || undefined, normalizeSku: skuNormalizer }))
  }

  async function importBackup(file: File) {
    const restored = await restoreBackup(await file.text())
    setImports([...restored.imports].sort((a, b) => b.importedAt.localeCompare(a.importedAt)))
    setCosts([...restored.costs])
    setClassificationRules([...restored.classificationRules])
    const current = restored.imports[0]
    if (current) openImport(current)
  }

  return (
    <><AppShell active={active} mobileNavOpen={mobileNav} reportName={fileName} reportLoaded={Boolean(effectiveDataset)} onToggleMobileNav={() => setMobileNav((value) => !value)} onNavigate={(page) => { setActive(page); setMobileNav(false) }}>
      {active !== 'Reports' && active !== 'Data & Settings' && dataset ? <GlobalFilters source={dataset.source} fulfillmentTypes={fulfillmentTypes} fulfillmentType={fulfillmentFilter} fromDate={fromDate} toDate={toDate} minDate={dateExtent.min} maxDate={dateExtent.max} period={periodChoice} periods={comparisonPeriods} onFulfillmentTypeChange={setFulfillmentFilter} onFromDateChange={setFromDate} onToDateChange={setToDate} onPeriodChange={applyPeriod} onClear={() => { setFulfillmentFilter(''); setPeriodChoice('') }} /> : null}
      {active === 'Products' ? dataset ? <ProductProfitability items={productProfitability} portfolio={productPortfolio} formatMoney={money} fileName={fileName} onManageCosts={() => setActive('Data & Settings')} onSelectSku={openOrders} /> : <ReportRequired area="Products" onOpenReports={() => setActive('Reports')}>Upload a sales report to understand the profit, costs, fees, and returns for each product.</ReportRequired> : active === 'Returns' ? dataset ? <ReturnAnalysis summary={returnSummary} formatMoney={money} onSelectSku={openOrders} fileName={fileName} /> : <ReportRequired area="Returns" onOpenReports={() => setActive('Reports')}>Upload a report to separate RTO from customer returns and find products or locations with return problems.</ReportRequired> : active === 'Advertising' ? dataset ? <AdvertisingAnalysis summary={advertisingSummary} formatMoney={money} fileName={fileName} accountTypes={accountTypes} fulfillmentTypes={fulfillmentTypes} accountType={adAccountType} fulfillmentType={adFulfillmentType} onAccountTypeChange={setAdAccountType} onFulfillmentTypeChange={setAdFulfillmentType} onSelectSku={openAdvertisingSku} /> : <ReportRequired area="Advertising" onOpenReports={() => setActive('Reports')}>Upload a report containing advertising charges to analyze TACOS, ROAS, trends, and SKU attribution.</ReportRequired> : active === 'Reports' ? <ReportsPage dataset={effectiveDataset} rawDataset={rawDataset} needsMapping={needsMapping} importing={importing} importError={importError} fileName={fileName} imports={imports} currentImportId={currentImportId} leftId={comparisonLeftId} rightId={comparisonRightId} comparison={importComparison} qualityCenter={qualityCenter} formatMoney={money} classificationRules={classificationRules} onFile={onFile} onApplyMapping={applyMapping} onLeftChange={setComparisonLeftId} onRightChange={setComparisonRightId} onOpen={openImport} onSaveClassificationRule={saveRule} onDeleteClassificationRule={deleteRule} onQualityAction={handleQualityAction} /> : active === 'Data & Settings' ? <DataSettingsPage events={allEvents} costs={costs} missingCostPolicy={missingCostPolicy} normalizeSku={skuNormalizer} importCount={imports.length} ruleCount={classificationRules.length} onSaveCosts={updateCosts} onMissingCostPolicyChange={setMissingCostPolicy} onExportBackup={() => downloadBackup({ imports, costs, classificationRules })} onRestoreBackup={importBackup} /> : <>
          <PageHeader eyebrow="Business overview" title="Here’s how your business is performing" description="See sales, real profit, returns, and the biggest issues affecting this report." action={<>{dataset ? <button className="secondary" onClick={exportAuditWorkbook}>Export audit workbook</button> : null}<button className="secondary" onClick={() => setActive('Reports')}>{dataset ? 'Change report' : 'Upload report'}</button></>} />
          {!dataset ? <section className="welcome-empty"><div className="welcome-illustration">↗</div><h2>Get your first trustworthy profit view</h2><ol className="welcome-steps"><li><b>Upload</b><span>Choose your marketplace CSV or TSV report.</span></li><li><b>Review</b><span>Confirm reconciliation and unfamiliar transactions.</span></li><li><b>Add costs</b><span>Complete or explicitly estimate product costs.</span></li><li><b>Analyze</b><span>Trace Dashboard → SKU → order evidence.</span></li></ol><button className="primary" onClick={() => setActive('Reports')}>Upload your first report</button><small>Your data stays in this browser. Profit remains an estimate until cost coverage is complete.</small></section> : null}
          {dataset ? <>
          <div className="section-label"><span>Business snapshot</span><small>Primary metrics</small></div>
          <section className="kpi-grid primary-kpis">
            <KpiCard label="Gross sales" value={dataset ? money(summary.grossSales) : '—'} tone="positive" hint="Positive product-sale events" onClick={() => setHomeMetric('GROSS_SALES')} />
            <KpiCard label="Profit after ads" value={dataset && costStatus.profitReady ? money(profitAfterAds) : '—'} tone={profitAfterAds >= 0 ? 'positive' : 'negative'} hint={costStatus.complete ? 'Tax-inclusive operating net less COGS' : 'Estimated · missing costs assumed ₹0'} onClick={() => setHomeMetric('PROFIT')} />
            <KpiCard label="Profit margin" value={dataset && costStatus.profitReady ? `${profitMargin.toFixed(2)}%` : '—'} tone={profitMargin >= 0 ? 'positive' : 'negative'} hint="Profit after ads ÷ gross sales" onClick={() => setHomeMetric('PROFIT_MARGIN')} />
            <KpiCard label="Orders" value={orders.length.toLocaleString('en-IN')} tone="accent" hint="Click to compare orders by SKU" onClick={() => setHomeMetric('ORDERS')} />
            <KpiCard label="Return rate" value={dataset ? `${summary.returnRate.toFixed(2)}%` : '—'} tone={summary.returnRate > 15 ? 'negative' : 'neutral'} hint={`${summary.returnQuantity.toLocaleString('en-IN')} returned units`} onClick={() => setHomeMetric('RETURN_RATE')} />
            <KpiCard label="TACOS" value={dataset ? `${summary.tacos.toFixed(2)}%` : '—'} tone="accent" hint="Ads spend ÷ gross sales" onClick={() => setHomeMetric('TACOS')} />
          </section>

          <details className="more-metrics"><summary><span><strong>More financial details</strong><small>Revenue, costs, fees and advertising</small></span><b>Show details</b></summary><section className="kpi-grid secondary-kpis">
            <KpiCard label="Net product revenue" value={money(summary.netProductRevenue)} tone="positive" hint="Sales less product refunds" onClick={() => setHomeMetric('NET_REVENUE')} />
            <KpiCard label="Net COGS" value={costStatus.profitReady ? money(costStatus.netCogs) : '—'} tone="negative" hint={costStatus.complete ? 'Good returns reverse COGS' : `${costStatus.missingSkus.length} costs assumed ₹0`} onClick={() => setHomeMetric('NET_COGS')} />
            <KpiCard label="Ads spend" value={money(summary.adsSpend)} tone="accent" hint={`ROAS ${summary.roas.toFixed(2)}×`} onClick={() => setHomeMetric('ADS')} />
            <KpiCard label="Marketplace charges" value={money(summary.marketplaceCharges)} tone="negative" hint="Excludes Easy Ship and ads" onClick={() => setHomeMetric('MARKETPLACE_CHARGES')} />
            <KpiCard label="Net Easy Ship fee" value={money(summary.netEasyShipFee)} tone="negative" hint="Charges less reversals" onClick={() => setHomeMetric('EASY_SHIP')} />
            <KpiCard label="Refund value" value={money(summary.refundValue)} tone="negative" hint="Product revenue refunded" onClick={() => setHomeMetric('REFUNDS')} />
            <KpiCard label="Reimbursements" value={money(summary.reimbursements)} tone="positive" hint="Net reimbursement events" onClick={() => setHomeMetric('REIMBURSEMENTS')} />
            <KpiCard label="Average selling price" value={money(summary.averageSellingPrice)} hint="Gross sales ÷ sold quantity" onClick={() => setHomeMetric('ASP')} />
            <KpiCard label="Profit before ads" value={costStatus.profitReady ? money(profitBeforeAds) : '—'} tone={profitBeforeAds >= 0 ? 'positive' : 'negative'} hint={`ROI ${roi.toFixed(2)}% after ads`} onClick={() => setHomeMetric('PROFIT_BEFORE_ADS')} />
            <KpiCard label="Profit per delivered unit" value={unitEconomics.profitPerDeliveredUnit === null ? '—' : money(unitEconomics.profitPerDeliveredUnit)} tone={(unitEconomics.profitPerDeliveredUnit ?? 0) >= 0 ? 'positive' : 'negative'} hint={unitEconomics.profitPerDeliveredUnit === null ? 'Needs complete costs and delivered units' : 'Profit after ads ÷ net delivered units'} onClick={() => setHomeMetric('PROFIT_PER_DELIVERED_UNIT')} />
            <KpiCard label="Break-even TACOS" value={unitEconomics.breakEvenTacos === null ? '—' : `${unitEconomics.breakEvenTacos.toFixed(2)}%`} tone={unitEconomics.breakEvenTacos === null ? 'neutral' : summary.tacos <= unitEconomics.breakEvenTacos ? 'positive' : 'negative'} hint={unitEconomics.breakEvenTacos === null ? 'Needs complete costs and gross sales' : `Current TACOS ${summary.tacos.toFixed(2)}%`} onClick={() => setHomeMetric('BREAK_EVEN_TACOS')} />
            <KpiCard label="Fee audit" value={`${feeAudit.issueCount} warnings`} tone={feeAudit.criticalCount ? 'negative' : feeAudit.issueCount ? 'accent' : 'positive'} hint={`${feeAudit.affectedOrderCount} affected orders`} onClick={() => setFeeAuditOpen(true)} />
          </section></details>

          <section className="content-grid two">
            <LineChart data={trend} />
            <div className="panel health-panel">
              <div className="panel-head"><div><small>Data quality</small><h3>What needs attention</h3></div><span className="status warning">Live</span></div>
              <div className="insight-list">
                <div className={costStatus.complete ? 'insight positive' : 'insight warning'}><span>₹</span><div><strong>{costStatus.coveragePercent.toFixed(0)}% cost coverage</strong><p>{costStatus.complete ? 'All imported sales SKUs have costs.' : `${costStatus.missingSkus.length} SKU costs are currently assumed as ₹0.`}</p></div></div>
                <button className={(effectiveDataset?.quality.unclassifiedEventCount ?? 0) ? 'insight warning actionable' : 'insight positive actionable'} onClick={() => setActive('Reports')}><span>?</span><div><strong>{effectiveDataset?.quality.unclassifiedEventCount ?? 0} transactions need review</strong><p>{money(summary.unclassifiedAmount)} from unfamiliar transaction types remains included and visible. Open Reports to review.</p></div></button>
                <div className="insight positive"><span>✓</span><div><strong>{effectiveDataset?.quality.reconciliation.reconciled ? 'Report accuracy check passed' : 'Review report accuracy'}</strong><p>{`${filteredEvents.length.toLocaleString('en-IN')} transactions processed in the current selection.`}</p></div></div>
              </div>
            </div>
          </section>

          <ProfitBridge format={money} profit={profitAfterAds} items={[
            { label: 'Gross sales', value: summary.grossSales, kind: 'income' },
            { label: 'Product refunds', value: -summary.refundValue, kind: 'cost' },
            { label: 'Marketplace charges', value: -summary.marketplaceCharges, kind: 'cost' },
            { label: 'Net Easy Ship fee', value: -summary.netEasyShipFee, kind: 'cost' },
            { label: 'Advertising', value: -summary.adsSpend, kind: 'cost' },
            { label: 'Reimbursements', value: summary.reimbursements, kind: 'income' },
            { label: 'Tax included', value: summary.taxNet, kind: 'adjustment' },
            { label: 'Other operating adjustments', value: otherOperating, kind: 'adjustment' },
            { label: 'Net COGS', value: -costStatus.netCogs, kind: 'cost' },
          ]} />

          <section className="content-grid two lower">
            <BarChart items={products} onSelectSku={openOrders} />
            <section className="panel cost-panel"><div className="panel-head"><div><small>Product costs</small><h3>{costStatus.missingSkus.length ? `${costStatus.missingSkus.length} products need costs` : 'Cost coverage complete'}</h3><p>{costStatus.coveragePercent.toFixed(0)}% of imported products covered. Costs stay in this browser.</p></div></div><button className="primary full" onClick={() => setActive('Data & Settings')}>Manage product costs</button></section>
          </section>

          <section className="panel table-panel">
            <div className="panel-head"><div><small>Product performance</small><h3>Top five products</h3></div><button className="text-btn" onClick={() => { setDrilldownSku(undefined); setHomeMetric('GROSS_SALES') }}>Explore all products</button></div>
            <div className="table-scroll"><table><thead><tr><th>SKU</th><th>Gross sales</th><th>Net revenue</th><th>Sold</th><th>Returned</th><th>After marketplace activity</th></tr></thead><tbody>
              {!products.length ? <tr><td colSpan={6}>No product data in this selection.</td></tr> : products.slice(0, 5).map((product) => <tr key={product.sku}><td><button className="sku-drill-link" onClick={() => openOrders(product.sku)}>{product.sku}</button></td><td>{money(product.grossSales)}</td><td>{money(product.netRevenue)}</td><td>{product.soldQuantity}</td><td>{product.returnQuantity}</td><td className={product.operatingNet >= 0 ? 'good-text' : 'bad-text'}>{money(product.operatingNet)}</td></tr>)}
            </tbody></table></div>
          </section>
          </> : null}
          </>}
      </AppShell>
      {homeMetricResult ? <MetricSkuDrilldown result={homeMetricResult} products={productProfitability} previousProducts={previousProductProfitability} advertisingSkus={advertisingSummary.skus} comparisonPeriod={periodChoice} initialSku={drilldownSku} formatMoney={money} onClose={() => { setHomeMetric(null); setDrilldownSku(undefined) }} /> : null}
      {advertisingDrilldownOpen && advertisingSkuInsight && advertisingSkuProfit ? <AdvertisingSkuDrilldown insight={advertisingSkuInsight} product={advertisingSkuProfit} formatMoney={money} onClose={() => setAdvertisingDrilldownOpen(false)} /> : null}
      {feeAuditOpen ? <FeeAuditPanel result={feeAudit} orders={orders} formatMoney={money} onClose={() => setFeeAuditOpen(false)} /> : null}
    </>
  )
}
