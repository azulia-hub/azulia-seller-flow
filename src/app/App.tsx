import '../components/sellerRefinements.css'
import { hostedDelivery, hostedView, subscribeHosted } from '../adapters/amazon-hosted/client'
import { HostedAmazonConnection } from '../components/HostedAmazonConnection'
import { useAutomaticReport } from './useAutomaticReport'
import { DashboardSkeleton } from '../components/DashboardSkeleton'
import { AutomaticReportStatus } from '../components/AutomaticReportStatus'
import { deliveryVersion, type AutomaticReading } from '../adapters/amazon-report-sync/readingStore'
import { lazy, Suspense, useSyncExternalStore } from 'react'
import { LiveOrderList } from '../components/LiveOrderList'
import { OrderCohortSummary } from '../components/OrderCohortSummary'
import { OrderActivityContext } from '../components/OrderActivityContext'
import { FocusPriorities } from '../components/FocusPriorities'
import { buildFocusAnalysis, type FocusArea } from '../core/insights/focusAnalysis'
import { previewProductProfitability } from '../core/analytics/productCostPreview'
import { buildBusinessOverview } from '../core/analytics/businessOverview'
import { computePulseScoreboard } from '../core/analytics/pulseScoreboard'
import { PulseScoreboard } from '../components/PulseScoreboard'
import { detectProfitLeaks } from '../core/insights/profitLeakDetector'
import { ProfitLeakAlerts } from '../components/ProfitLeakAlerts'
import { findReimbursementClaims } from '../core/reimbursements/reimbursementFinder'
import { ReimbursementFinderModal } from '../components/ReimbursementFinderModal'
import { predictInventoryRestock } from '../core/inventory/restockPredictor'
import { RestockPredictorModal } from '../components/RestockPredictorModal'
import { forecastCashSettlements } from '../core/cashflow/payoutForecast'
import { CashFlowForecastModal } from '../components/CashFlowForecastModal'
import { FinancialSummary } from '../components/FinancialSummary'
import { ProductPage } from '../components/ProductPage'
import { useProductPage } from './useProductPage'
import { loadActiveReportId, saveActiveReportId, loadAnalysisView, saveAnalysisView } from '../adapters/browser/activeReportStore'
import { buildReportSearchIndex, type ReportSearchDocument } from '../core/search/reportSearch'
import { ReportSearch, ReportSearchDetail } from '../components/ReportSearch'
import { ProductCostEditorContext } from '../components/ProductCostEditor'
import { setProductCost } from '../core/costs/setProductCost'
import { AdvertisingRecoveryContext, advertisingDateRange } from '../components/AdvertisingRecovery'
import { listAccountCharges } from '../core/analytics/accountCharges'
import { DashboardAdvertising } from '../components/DashboardAdvertising'
import { ProductPerformanceList } from '../components/ProductPerformanceList'
import { buildSellerProductOverviews } from '../core/advertising/sellerOverview'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { KpiCard } from '../components/KpiCard'
import { LineChart } from '../components/LineChart'
import { parseCsvDataset } from '../core/csv/parseCsv'
import type { CanonicalDataset } from '../core/data/types'
import type { RawDataset } from '../core/data/types'
import { autoDetectSource } from '../adapters/sourceDetection'
import { canonicalDateKey, dailySales, filterEvents } from '../core/analytics/dashboardSummary'
import type { MissingCostPolicy } from '../core/costs/calculateCosts'
import type { ProductCost } from '../core/costs/types'
import { loadProductCosts, saveProductCosts } from '../adapters/browser/costStore'
import { normalizeAmazonSku } from '../adapters/amazon/unifiedTransactionAdapter'
import { ProfitBridge } from '../components/ProfitBridge'
import { summarizeOrders, summarizeProductProfitability, summarizeSkuProfit } from '../core/analytics/orderProfit'
import { summarizeReturns } from '../core/analytics/returnSummary'
import { compareImports, profileDataset, type StoredImport } from '../core/imports/importHistory'
import { loadImports, saveImport } from '../adapters/browser/importStore'
import { AppShell } from './AppShell'
import type { AppPage } from './navigation'
import { GlobalFilters } from '../components/GlobalFilters'
import { PageHeader } from '../components/PageHeader'
import { ReportRequired } from '../components/ReportRequired'
import { applyClassificationRules, classificationRuleKey } from '../core/classification/classificationRules'
import type { ClassificationRule } from '../core/classification/types'
import { loadClassificationRules, saveClassificationRules } from '../adapters/browser/classificationRuleStore'
import { summarizeAdvertising } from '../core/analytics/advertisingSummary'
import { buildMetricSkuDrilldown, type MetricDrilldownId } from '../core/analytics/metricDrilldown'
import { MetricSkuDrilldown } from '../components/MetricSkuDrilldown'
import { TIME_PERIOD_OPTIONS, previousEqualRange, rangeCoverage, recommendTimePeriod, resolveTimePeriod, type TimePeriodPreset } from '../core/analytics/timePeriods'
import { buildDataQualityCenter, type QualityAction } from '../core/validation/dataQualityCenter'
import { buildFeeAudit } from '../core/analytics/feeAudit'
import { FeeAuditPanel } from '../features/fees/FeeAuditPanel'
import { buildAuditWorkbook } from '../core/export/auditWorkbook'
import { downloadWorkbook } from '../adapters/browser/downloadWorkbook'
import { downloadBackup, restoreBackup } from '../adapters/browser/backupStore'
import { countFinancialRecords, indexOrderHistory, selectOrderCohort, buildCohortFinancials } from '../core/analytics/orderLifecycle'
import { OrderLifecycleSnapshot } from '../components/OrderLifecycleSnapshot'
import type { SponsoredProductsReport } from '../core/advertising/types'
import { buildSponsoredProductsAttribution, intersectAdvertisingRange } from '../core/advertising/sponsoredProducts'
import { loadSponsoredProductsReport, saveSponsoredProductsReport } from '../adapters/browser/sponsoredProductsStore'

const ToolsPage = lazy(() => import('../features/tools/ToolsPage').then(module => ({ default: module.ToolsPage })))
const CostMaster = lazy(() => import('../features/costs/CostMaster').then(module => ({ default:module.CostMaster })))
const ReportsPage = lazy(() => import('../features/reports/ReportsPage').then(module => ({ default:module.ReportsPage })))
const ReturnAnalysis = lazy(() => import('../features/returns/ReturnAnalysis').then(module => ({ default:module.ReturnAnalysis })))
const DataSettingsPage = lazy(() => import('../features/settings/DataSettingsPage').then(module => ({ default:module.DataSettingsPage })))

type PeriodChoice = TimePeriodPreset | 'ALL' | 'CUSTOM'

function advertisingMoney(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n === 0 ? 0 : n)
}

function money(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n === 0 ? 0 : n)
}

export function App() {
  const [automaticEnabled, setAutomaticEnabled] = useState(() => { try { return localStorage.getItem('azulia.report-delivery') !== 'manual' } catch { return true } })
  const [automaticIssues, setAutomaticIssues] = useState<string[]>([])
  const automaticIdentity = useRef<string | null>(null)
  function deliveryMode(enabled: boolean) { setAutomaticEnabled(enabled); try { localStorage.setItem('azulia.report-delivery', enabled ? 'automatic' : 'manual') } catch { /* Mode still works for this visit. */ } }
  const [active, setActive] = useState<AppPage>('Home')
  const [mobileNav, setMobileNav] = useState(false)
  const [fileName, setFileName] = useState('August 2026 Amazon report')
  const [dataset, setDataset] = useState<CanonicalDataset | null>(null)
  const [rawDataset, setRawDataset] = useState<RawDataset | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [requestedFulfillmentFilter, setFulfillmentFilter] = useState('')
  const fulfillmentFilter = useDeferredValue(requestedFulfillmentFilter)
  const [filterUpdatePending, setFilterUpdatePending] = useState(false)
  const [requestedFromDate, setFromDate] = useState('')
  const fromDate = useDeferredValue(requestedFromDate)
  const [requestedToDate, setToDate] = useState('')
  const toDate = useDeferredValue(requestedToDate)
  const filtersUpdating = filterUpdatePending && (requestedFromDate !== fromDate || requestedToDate !== toDate || requestedFulfillmentFilter !== fulfillmentFilter)
  useEffect(() => {
    if (filterUpdatePending && !filtersUpdating) setFilterUpdatePending(false)
  }, [filterUpdatePending, filtersUpdating])
  const [periodChoice, setPeriodChoice] = useState<PeriodChoice | ''>('')
  const [costs, setCosts] = useState<ProductCost[]>(() => loadProductCosts())
  const userSelectedReport = useRef(false)
  const [costDraft, setCostDraft] = useState<ProductCost | null>(null)
  const deferredCostDraft = useDeferredValue(costDraft)
  const appliedCostDraft = costDraft ? deferredCostDraft : null
  const cancelCostPreview = useCallback(() => setCostDraft(null), [])
  const [searchDetail, setSearchDetail] = useState<ReportSearchDocument | null>(null)
  const [missingCostPolicy, setMissingCostPolicy] = useState<MissingCostPolicy>('ASSUME_ZERO')
  const [focusArea, setFocusArea] = useState<FocusArea>('SALES')
  const [homeMetric, setHomeMetric] = useState<MetricDrilldownId | null>(null)
  const { productSelection, openProductPage, clearProductPage, closeProductPage } = useProductPage(useCallback(origin => { setActive(origin.page); setHomeMetric(origin.metric) }, []), cancelCostPreview)
  const [imports, setImports] = useState<StoredImport[]>([])
  const [currentImportId, setCurrentImportId] = useState<string | null>(null)
  const [comparisonLeftId, setComparisonLeftId] = useState('')
  const [comparisonRightId, setComparisonRightId] = useState('')
  const [classificationRules, setClassificationRules] = useState<ClassificationRule[]>(() => loadClassificationRules())
  const [feeAuditOpen, setFeeAuditOpen] = useState(false)
  const [reimbursementModalOpen, setReimbursementModalOpen] = useState(false)
  const [restockModalOpen, setRestockModalOpen] = useState(false)
  const [cashFlowModalOpen, setCashFlowModalOpen] = useState(false)
  const [cohortSnapshotOpen, setCohortSnapshotOpen] = useState(false)
  const [advertisingDateUndo, setAdvertisingDateUndo] = useState<{
    fromDate: string; toDate: string; periodChoice: PeriodChoice | ''; fulfillmentFilter: string;
    reportId: string; financialId: string | null; appliedFrom: string; appliedTo: string;
  } | null>(null)

  const [sponsoredReport, setSponsoredReport] = useState<SponsoredProductsReport | null>(null)
  const [sponsoredImporting, setSponsoredImporting] = useState(false)
  const [sponsoredError, setSponsoredError] = useState<string | null>(null)

  const applyAutomaticReading = useCallback((reading: AutomaticReading) => {
    userSelectedReport.current = true
    const changedIdentity = automaticIdentity.current !== reading.connectionKey
    automaticIdentity.current = reading.connectionKey
    setDataset(reading.dataset); setRawDataset(reading.raw); setFileName(reading.fileName); setCurrentImportId(reading.id); setAutomaticIssues(reading.issues)
    saveActiveReportId(reading.id)
    setImports(previous => [reading, ...previous.filter(item => item.id !== reading.id)])
    if (changedIdentity) {
      const saved = loadAnalysisView(reading.id), today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
      setFromDate(saved?.from ?? new Date(Date.parse(today) - 29 * 86400000).toISOString().slice(0, 10)); setToDate(saved?.to ?? today); setPeriodChoice(saved?.period ?? 'CUSTOM'); setFulfillmentFilter(saved?.fulfillment ?? '')
    }
  }, [])
  const automaticDelivery = useAutomaticReport({ enabled: automaticEnabled, visibleConnectionKey: currentImportId?.startsWith('api:') ? currentImportId.slice(4) : undefined, range: currentImportId?.startsWith('api:') && fromDate && toDate ? { from: fromDate, to: toDate } : null, onReading: applyAutomaticReading, onIdentityChange: () => { setDataset(null); setRawDataset(null); setCurrentImportId(null); automaticIdentity.current = null } })
  const hostedState = useSyncExternalStore(subscribeHosted, hostedView, hostedView)
  const isHostedActive = hostedDelivery && Boolean(hostedState.account || hostedState.busy || automaticDelivery.status?.configured || automaticDelivery.calculating || automaticDelivery.status?.state === 'syncing')
  const isAutomaticPreparing = automaticEnabled && !dataset && !automaticDelivery.error && (hostedDelivery ? isHostedActive : automaticDelivery.status?.configured !== false)
  useEffect(() => {
    loadImports().then((saved) => {
      setImports(saved)
      setComparisonLeftId(saved[0]?.id ?? '')
      setComparisonRightId(saved[1]?.id ?? saved[0]?.id ?? '')
      const latest = saved.find(item => item.id === loadActiveReportId()) ?? saved[0]
      if (latest && !userSelectedReport.current) openImport(latest, false)
    }).catch((error) => setImportError(error instanceof Error ? error.message : 'Could not load import history.'))
  }, [])

  useEffect(() => {
    loadSponsoredProductsReport().then(setSponsoredReport).catch(error => setSponsoredError(error instanceof Error ? error.message : 'Could not load the saved advertising report.'))
  }, [])

  const effectiveDataset = useMemo(() => dataset ? applyClassificationRules(dataset, classificationRules) : null, [dataset, classificationRules])
  const allEvents = effectiveDataset?.events ?? []
  const skuNormalizer = dataset?.source === 'amazon' ? normalizeAmazonSku : undefined
  const analyticsCosts = useMemo(() => appliedCostDraft ? setProductCost(costs, appliedCostDraft, skuNormalizer) : costs, [costs, appliedCostDraft, skuNormalizer])
  const periodScopeEvents = useMemo(() => filterEvents(allEvents, { fulfillmentType: fulfillmentFilter || undefined }), [allEvents, fulfillmentFilter])
  const postedEvents = useMemo(() => filterEvents(periodScopeEvents, { fromDate: fromDate || undefined, toDate: toDate || undefined }), [periodScopeEvents, fromDate, toDate])
  const postedRecordCount = useMemo(() => countFinancialRecords(postedEvents), [postedEvents])
  const sourceOrders = effectiveDataset?.orders
  const scopedOrders = useMemo(() => sourceOrders?.filter(order => !fulfillmentFilter || !order.fulfillmentType || order.fulfillmentType === fulfillmentFilter), [sourceOrders, fulfillmentFilter])
  const orderHistory = useMemo(() => indexOrderHistory(periodScopeEvents, scopedOrders), [periodScopeEvents, scopedOrders])
  const orderCohort = useMemo(() => fromDate && toDate ? selectOrderCohort(orderHistory, { from: fromDate, to: toDate }, 'ALL_RECORDED') : null, [orderHistory, fromDate, toDate])
  const filteredEvents = orderCohort?.events ?? []
  const cohortFinancials = useMemo(() => {
    if (!orderCohort) return null
    const details = productSelection?.scope === 'CURRENT'
    if (!details) return null
    return buildCohortFinancials(orderCohort, analyticsCosts, missingCostPolicy, skuNormalizer, details)
  }, [orderCohort, analyticsCosts, missingCostPolicy, skuNormalizer, productSelection])
  const business = useMemo(() => buildBusinessOverview(filteredEvents, analyticsCosts, missingCostPolicy, skuNormalizer, orderCohort?.orders.map(order => order.orderId)), [filteredEvents, analyticsCosts, missingCostPolicy, skuNormalizer, orderCohort])
  const { summary, costStatus, profitAfterAds, profitBeforeAds, profitMargin, roi, unitEconomics, otherOperating } = business
  const trend = useMemo(() => dailySales(filteredEvents, 'ORDER_PURCHASE'), [filteredEvents])
  const fulfillmentTypes = useMemo(() => [...new Set([...allEvents.flatMap((event) => event.fulfillmentType ? [event.fulfillmentType] : []), ...(sourceOrders ?? []).flatMap(order => order.fulfillmentType ? [order.fulfillmentType] : [])])].sort(), [allEvents, sourceOrders])
  const dateExtent = useMemo(() => {
    const dates = [...allEvents.flatMap((event) => [canonicalDateKey(event.date), canonicalDateKey(event.orderPurchaseDate ?? null)].filter((date): date is string => Boolean(date))), ...(sourceOrders ?? []).map(order => order.purchaseDate)].sort()
    return { min: dates[0], max: dates.at(-1) }
  }, [allEvents, sourceOrders])
  const isApiData = Boolean(automaticEnabled && currentImportId?.startsWith('api:'))
  const periodAnchor = isApiData
    ? new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
    : dateExtent.max
  const comparisonPeriods = useMemo(() => {
    if (isApiData) return TIME_PERIOD_OPTIONS
    if (!dateExtent.min || !dateExtent.max || !periodAnchor) return []
    return TIME_PERIOD_OPTIONS.filter(option => {
      const period = resolveTimePeriod(option.id, periodAnchor)
      return rangeCoverage(period.current, dateExtent.min!, dateExtent.max!) !== 'No data coverage'
    })
  }, [isApiData, periodAnchor, dateExtent.min, dateExtent.max])
  useEffect(() => {
    if (!dateExtent.min || !dateExtent.max) return
    if (periodChoice === 'CUSTOM') return
    if (isApiData && periodChoice && periodChoice !== 'ALL' && periodAnchor) {
      const current = resolveTimePeriod(periodChoice, periodAnchor).current
      setFromDate(current.from); setToDate(current.to); return
    }
    if (periodChoice === 'ALL') {
      setFromDate(dateExtent.min)
      setToDate(dateExtent.max)
      return
    }
    if (!periodChoice) {
      setPeriodChoice('ALL')
      setFromDate(dateExtent.min)
      setToDate(dateExtent.max)
      return
    }
    const recommended = recommendTimePeriod(dateExtent.min, dateExtent.max)
    const next = comparisonPeriods.some(option => option.id === periodChoice)
      ? periodChoice as TimePeriodPreset
      : comparisonPeriods.find(option => option.id === recommended)?.id ?? comparisonPeriods.at(-1)?.id
    if (next && periodAnchor) {
      const current = resolveTimePeriod(next, periodAnchor).current
      setPeriodChoice(next)
      setFromDate(current.from)
      setToDate(current.to)
    } else {
      setPeriodChoice('CUSTOM')
      setFromDate(dateExtent.min)
      setToDate(dateExtent.max)
    }
  }, [dateExtent.min, dateExtent.max, comparisonPeriods, periodChoice, isApiData, periodAnchor])

  useEffect(() => {
    if (currentImportId && fromDate && toDate && fromDate <= toDate && periodChoice) saveAnalysisView(currentImportId, { from:fromDate, to:toDate, period:periodChoice, basis:'SALE_PERIOD_ORDERS', fulfillment:fulfillmentFilter })
  }, [currentImportId, fromDate, toDate, periodChoice, fulfillmentFilter])

  function applyPeriod(next: PeriodChoice) {
    setFilterUpdatePending(true)
    setPeriodChoice(next)
    if (next === 'ALL' && dateExtent.min && dateExtent.max) {
      setFromDate(dateExtent.min)
      setToDate(dateExtent.max)
    } else if (next !== 'CUSTOM' && next !== 'ALL' && periodAnchor) {
      const current = resolveTimePeriod(next, periodAnchor).current
      setFromDate(current.from)
      setToDate(current.to)
    }
  }
  const orders = useMemo(() => summarizeOrders(feeAuditOpen ? filteredEvents : [], analyticsCosts, missingCostPolicy, skuNormalizer), [filteredEvents, analyticsCosts, missingCostPolicy, skuNormalizer, feeAuditOpen])
  const returnSummary = useMemo(() => summarizeReturns(active === 'Returns' || (active === 'Home' && !productSelection) ? filteredEvents : [], analyticsCosts, skuNormalizer), [filteredEvents, analyticsCosts, skuNormalizer, active, productSelection])
  const needsProducts = active === 'Home' || active === 'Products' || active === 'Advertising' || Boolean(homeMetric) || productSelection?.scope === 'CURRENT'
  const savedProductProfitability = useMemo(() => summarizeProductProfitability(needsProducts ? filteredEvents : [], costs, missingCostPolicy, skuNormalizer), [needsProducts, filteredEvents, costs, missingCostPolicy, skuNormalizer])
  const productProfitability = useMemo(() => appliedCostDraft ? previewProductProfitability(savedProductProfitability, filteredEvents, analyticsCosts, missingCostPolicy, appliedCostDraft.sku, skuNormalizer) : savedProductProfitability, [savedProductProfitability, filteredEvents, analyticsCosts, missingCostPolicy, appliedCostDraft, skuNormalizer])
  const comparisonProductProfitability = useMemo(() => summarizeProductProfitability(homeMetric ? (dateExtent.min && dateExtent.max ? selectOrderCohort(orderHistory, { from:dateExtent.min, to:dateExtent.max }, 'ALL_RECORDED').events : periodScopeEvents) : [], analyticsCosts, missingCostPolicy, skuNormalizer), [periodScopeEvents, orderHistory, analyticsCosts, missingCostPolicy, skuNormalizer, homeMetric, dateExtent.min, dateExtent.max])
  const previousRange = useMemo(() => {
    if ((periodChoice === 'CUSTOM' || periodChoice === 'ALL') && fromDate && toDate) return previousEqualRange({ from: fromDate, to: toDate })
    return periodChoice && periodChoice !== 'CUSTOM' && periodChoice !== 'ALL' && periodAnchor ? resolveTimePeriod(periodChoice, periodAnchor).previous : undefined
  }, [periodChoice, fromDate, toDate, periodAnchor])
  const previousEvents = useMemo(() => {
    if (!previousRange) return []
    return selectOrderCohort(orderHistory, previousRange, 'ALL_RECORDED').events
  }, [orderHistory, previousRange])
  const previousProductProfitability = useMemo(() => summarizeProductProfitability(homeMetric ? previousEvents : [], analyticsCosts, missingCostPolicy, skuNormalizer), [previousEvents, analyticsCosts, missingCostPolicy, skuNormalizer, homeMetric])
  const previousOrders = useMemo(() => summarizeOrders(feeAuditOpen ? previousEvents : [], analyticsCosts, missingCostPolicy, skuNormalizer), [previousEvents, analyticsCosts, missingCostPolicy, skuNormalizer, feeAuditOpen])
  const feeAudit = useMemo(() => buildFeeAudit(orders, previousOrders), [orders, previousOrders])
  const customComparisonRange = useMemo(() => (periodChoice === 'CUSTOM' || periodChoice === 'ALL') && fromDate && toDate ? { current: { from: fromDate, to: toDate }, previous: previousEqualRange({ from: fromDate, to: toDate }) } : undefined, [periodChoice, fromDate, toDate])
  const homeMetricResult = useMemo(() => homeMetric ? buildMetricSkuDrilldown(homeMetric, productProfitability, filteredEvents, comparisonProductProfitability, customComparisonRange) : null, [homeMetric, productProfitability, filteredEvents, comparisonProductProfitability, customComparisonRange])
  const pulseScoreboard = useMemo(() => {
    if (!allEvents.length && !sourceOrders?.length) return null
    return computePulseScoreboard({
      events: allEvents,
      costs: analyticsCosts,
      missingCostPolicy,
      normalizeSku: skuNormalizer,
      sourceOrders: sourceOrders?.map(order => {
        const matched = allEvents.find(e => e.orderId === order.orderId)
        const sku = order.sku || matched?.sku
        const asin = order.asin || (matched?.raw?.['asin'] as string)
        const matchedBySku = sku ? allEvents.find(e => e.sku === sku) : undefined
        const matchedByAsin = asin ? allEvents.find(e => e.raw?.['asin'] === asin) : undefined
        const title = order.title
          || (matched?.raw?.['product title'] as string)
          || (matchedBySku?.raw?.['product title'] as string)
          || (matchedByAsin?.raw?.['product title'] as string)
        const imageUrl = order.imageUrl
          || (matched?.raw?.['product image'] as string)
          || (matchedBySku?.raw?.['product image'] as string)
          || (matchedByAsin?.raw?.['product image'] as string)
        return {
          orderId: order.orderId,
          purchaseDate: order.purchaseDate,
          status: order.status,
          orderValue: order.orderValue,
          fulfillmentType: order.fulfillmentType,
          sku,
          asin,
          title,
          imageUrl,
        }
      }),
      anchorDate: periodAnchor,
    })
  }, [allEvents, analyticsCosts, missingCostPolicy, skuNormalizer, sourceOrders, periodAnchor])
  const profitLeakAlerts = useMemo(() => {
    if (!filteredEvents.length) return []
    return detectProfitLeaks({
      events: filteredEvents,
      costs: analyticsCosts,
      missingCostPolicy,
      normalizeSku: skuNormalizer,
    })
  }, [filteredEvents, analyticsCosts, missingCostPolicy, skuNormalizer])
  const reimbursementSummary = useMemo(() => findReimbursementClaims(allEvents), [allEvents])
  const restockPredictions = useMemo(() => predictInventoryRestock({ events: allEvents }), [allEvents])
  const cashFlowForecast = useMemo(() => forecastCashSettlements(allEvents), [allEvents])
  const accountCharges = useMemo(() => listAccountCharges(filteredEvents), [filteredEvents])
  const advertisingEvents = filteredEvents
  const baseAdvertisingSummary = useMemo(() => summarizeAdvertising(advertisingEvents), [advertisingEvents])
  const sharedAdvertisingDates = intersectAdvertisingRange(sponsoredReport, { from: dateExtent.min ?? '', to: dateExtent.max ?? '' })
  function viewSponsoredProducts() {
    setSearchDetail(null); cancelCostPreview()
    if (!sharedAdvertisingDates || !sponsoredReport) { setActive('Reports'); return }
    setAdvertisingDateUndo({ fromDate, toDate, periodChoice, fulfillmentFilter,
      reportId: sponsoredReport.id, financialId: currentImportId, appliedFrom: sharedAdvertisingDates.from, appliedTo: sharedAdvertisingDates.to })
    setPeriodChoice('CUSTOM'); setFromDate(sharedAdvertisingDates.from); setToDate(sharedAdvertisingDates.to)
    setFulfillmentFilter('')
    if (productSelection) openProductPage({ sku: productSelection.sku, scope: 'CURRENT' }, { page: active, metric: null })
    setActive(current => current === 'Reports' ? 'Advertising' : current)
  }
  function undoAdvertisingDates() {
    if (!advertisingDateUndo) return
    setFromDate(advertisingDateUndo.fromDate); setToDate(advertisingDateUndo.toDate); setPeriodChoice(advertisingDateUndo.periodChoice)
    setFulfillmentFilter(advertisingDateUndo.fulfillmentFilter)
    setAdvertisingDateUndo(null)
  }
  const showAdvertisingDateUndo = advertisingDateUndo && advertisingDateUndo.reportId === sponsoredReport?.id && advertisingDateUndo.financialId === currentImportId
    && fromDate === advertisingDateUndo.appliedFrom && toDate === advertisingDateUndo.appliedTo && periodChoice === 'CUSTOM'
    && !fulfillmentFilter

  const sponsoredAttribution = useMemo(() => buildSponsoredProductsAttribution(
    advertisingEvents, sponsoredReport,
    { from: fromDate || dateExtent.min || '', to: toDate || dateExtent.max || '' },
    { identityEvents: allEvents, normalizeSku: skuNormalizer,
      unsupportedFilter: Boolean(fulfillmentFilter) },
  ), [advertisingEvents, sponsoredReport, fromDate, toDate, dateExtent.min, dateExtent.max, allEvents, skuNormalizer, fulfillmentFilter])
  const advertisingProducts = productProfitability
  const sellerProducts = useMemo(() => buildSellerProductOverviews(sponsoredAttribution.status === 'AVAILABLE' ? advertisingProducts : productProfitability, advertisingProducts, sponsoredAttribution), [productProfitability, advertisingProducts, sponsoredAttribution])
  const searchDocuments = useMemo(() => buildReportSearchIndex(allEvents, {
    normalizeSku: skuNormalizer,
    productAliases: sponsoredReport?.rows.map(row => ({ sku: row.advertisedSku, aliases: [row.advertisedAsin] })),
  }), [allEvents, sponsoredReport, skuNormalizer])

  const focusAnalysis = useMemo(() => {
    if (active !== 'Home' || productSelection) return null
    const names = new Map(searchDocuments.filter(document => document.kind === 'PRODUCT').map(document => [document.sku,document.label]))
    const focusPostedProducts = new Map(advertisingProducts.map(product => [product.sku,product]))
    const economics = new Map(sellerProducts.map(product => [product.sku,product.contribution]))
    return buildFocusAnalysis({
      financialSkus:searchDocuments.flatMap(document => document.kind === 'PRODUCT' && document.sku ? [document.sku] : []), normalizeSku:skuNormalizer,
      products:productProfitability.map(product => ({ sku:product.sku, name:names.get(product.sku), sales:product.grossSales, profitBeforeAds:product.profitBeforeAds, profitAfterAds:product.profit, marketplaceCharges:product.marketplaceCharges, easyShipCharges:product.shippingFees, fulfillmentFees:product.fulfillmentFees, missingCost:product.missingCost, returnRate:product.returnRate })),
      returns:returnSummary.orders.map(order => ({ sku:order.sku, loss:order.returnLossAfterReimbursement, refundValue:order.refundValue, cogsRecovered:order.cogsRecovered, missingCost:order.missingCost })),
      ads:sponsoredAttribution.skus.map(product => ({ sku:product.sku, spend:product.spend, attributedSales:product.attributedSales, totalSales:product.grossSales, marketplaceCharges:focusPostedProducts.get(product.sku)?.marketplaceCharges, easyShipCharges:focusPostedProducts.get(product.sku)?.shippingFees, profitAfterAds:economics.get(product.sku) ?? null })),
      unmatchedAds:sponsoredAttribution.unmatched,
      campaigns:(sponsoredReport?.rows ?? []).map(row => ({ campaign:row.campaign, portfolio:row.portfolio, sku:row.advertisedSku, date:row.date, spend:row.spendExcludingTax, attributedSales:row.attributedSales })),
      from:fromDate, to:toDate, advertisingAvailable:sponsoredAttribution.status === 'AVAILABLE',
    })
  }, [active, productSelection, searchDocuments, sellerProducts, advertisingProducts, productProfitability, returnSummary, sponsoredAttribution, sponsoredReport, fromDate, toDate, skuNormalizer])

  const searchEvidenceEvents = useMemo(() => {
    if (!searchDetail) return []
    const ids = new Set(searchDetail.eventIds)
    const orderIds = new Set(allEvents.flatMap(event => ids.has(event.id) && event.orderId ? [event.orderId] : []))
    return allEvents.filter(event => ids.has(event.id) || Boolean(event.orderId && orderIds.has(event.orderId)))
  }, [allEvents, searchDetail])
  const searchOrders = useMemo(() => summarizeOrders(searchEvidenceEvents, analyticsCosts, missingCostPolicy, skuNormalizer), [searchEvidenceEvents, analyticsCosts, missingCostPolicy, skuNormalizer])
  function openSearchProduct(sku: string) {
    openProductPage({ sku, scope: 'CURRENT' }, { page: active, metric: homeMetric }); setSearchDetail(null); setHomeMetric(null)
  }
  const selectedProduct = useMemo(() => {
    if (!productSelection) return null
    if (productSelection.scope === 'REPORT') return summarizeSkuProfit(allEvents, productSelection.sku, analyticsCosts, missingCostPolicy, skuNormalizer)
    return (productSelection.scope === 'POSTED' ? advertisingProducts : productProfitability).find(product => product.sku === productSelection.sku) ?? null
  }, [productSelection, allEvents, analyticsCosts, missingCostPolicy, skuNormalizer, advertisingProducts, productProfitability])
  const reportAdvertising = useMemo(() => productSelection?.scope === 'REPORT' ? buildSponsoredProductsAttribution(allEvents, sponsoredReport, { from: dateExtent.min ?? '', to: dateExtent.max ?? '' }, { normalizeSku: skuNormalizer, identityEvents: allEvents }) : sponsoredAttribution, [productSelection?.scope, allEvents, sponsoredReport, dateExtent.min, dateExtent.max, skuNormalizer, sponsoredAttribution])
  const selectedAdProduct = productSelection?.scope === 'REPORT' ? selectedProduct ?? undefined : advertisingProducts.find(product => product.sku === productSelection?.sku)
  const importComparison = useMemo(() => {
    const left = imports.find((item) => item.id === comparisonLeftId)
    const right = imports.find((item) => item.id === comparisonRightId)
    if (active !== 'Reports' || !left || !right || left.id === right.id) return null
    return compareImports(left, right, analyticsCosts, missingCostPolicy, (source, sku) => source === 'amazon' ? normalizeAmazonSku(sku) : sku)
  }, [active, imports, comparisonLeftId, comparisonRightId, analyticsCosts, missingCostPolicy])
  const qualityCenter = useMemo(() => effectiveDataset && active === 'Reports' ? buildDataQualityCenter(effectiveDataset, costs, imports, currentImportId, skuNormalizer) : null, [active, effectiveDataset, costs, imports, currentImportId, skuNormalizer])
  const openOrders = (sku?: string) => { if (sku) { openProductPage({ sku, scope: 'CURRENT' }, { page: active, metric: homeMetric }); setHomeMetric(null) } }
  const openSellerProduct = (sku: string) => { openProductPage({ sku, scope: 'CURRENT' }, { page: active, metric: homeMetric }); setHomeMetric(null) }

  async function rememberImport(nextDataset: CanonicalDataset, nextFileName: string) {
    const item: StoredImport = { id: nextDataset.events[0]?.sourceDatasetId ?? crypto.randomUUID(), fileName: nextFileName, importedAt: new Date().toISOString(), dataset: nextDataset, profile: profileDataset(nextDataset) }
    await saveImport(item)
    setImports((current) => [item, ...current.filter((saved) => saved.id !== item.id)])
    setCurrentImportId(item.id)
    saveActiveReportId(item.id)
    setComparisonLeftId(item.id)
    setComparisonRightId((current) => current || item.id)
  }

  function openImport(item: StoredImport, navigate = true) {
    if (navigate) deliveryMode(item.id.startsWith('api:'))
    if (item.id.startsWith('api:') && (item as Partial<AutomaticReading>).deliveryVersion !== deliveryVersion) {
      // Old saved API totals used release dates. Rebuild from source before displaying them.
      setDataset(null); setRawDataset(null); setCurrentImportId(item.id)
      return
    }
    userSelectedReport.current = true
    saveActiveReportId(item.id)
    if (navigate) clearProductPage(); setHomeMetric(null); setSearchDetail(null); cancelCostPreview()
    setDataset(item.dataset)
    setRawDataset(null)
    setFileName(item.fileName)
    setCurrentImportId(item.id)
    const view = loadAnalysisView(item.id)
    setFulfillmentFilter(view?.fulfillment ?? ''); setFromDate(view?.from ?? ''); setToDate(view?.to ?? ''); setPeriodChoice(view?.period ?? ''); if (navigate) setActive('Home')
  }

  async function onFile(file: File) {
    deliveryMode(false)
    clearProductPage(); setHomeMetric(null); setSearchDetail(null)
    userSelectedReport.current = true
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
      if (detected) {
        const normalized = detected.adapter.normalize(raw)
        setDataset(normalized)
        await rememberImport(normalized, file.name)
      } else {
        throw new Error('Unsupported CSV format. Please upload an official Amazon Date Range Transaction Report (CSV/TSV), or connect directly via Amazon SP-API.')
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'The CSV could not be imported.')
    } finally {
      setImporting(false)
    }
  }

  async function onSponsoredFile(file: File) {
    setSponsoredImporting(true)
    setSponsoredError(null)
    try {
      const { parseSponsoredProductsWorkbook } = await import('../adapters/amazon/sponsoredProductsAdapter')
      const report = await parseSponsoredProductsWorkbook(await file.arrayBuffer(), file.name, crypto.randomUUID())
      await saveSponsoredProductsReport(report)
      setSponsoredReport(report)
    } catch (error) {
      setSponsoredError(error instanceof Error ? error.message : 'The advertising workbook could not be imported.')
    } finally {
      setSponsoredImporting(false)
    }
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
    if (action === 'MANAGE_COSTS') { setActive('Costs'); return }
    const target = action === 'REVIEW_CLASSIFICATION' ? 'classification-review' : action === 'COMPARE_REPORTS' ? 'report-comparison' : 'quality-center-title'
    requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function exportAuditWorkbook() {
    if (!effectiveDataset) return
    downloadWorkbook(buildAuditWorkbook({ cohort: orderCohort ?? undefined, dataset: effectiveDataset, events: filteredEvents, costs: analyticsCosts, missingCostPolicy, fileName, fromDate: fromDate || undefined, toDate: toDate || undefined, fulfillmentType: fulfillmentFilter || undefined, normalizeSku: skuNormalizer }))
  }

  async function importBackup(file: File) {
    const restored = await restoreBackup(await file.text())
    setImports([...restored.imports].sort((a, b) => b.importedAt.localeCompare(a.importedAt)))
    setCosts([...restored.costs])
    setClassificationRules([...restored.classificationRules])
    const current = restored.imports[0]
    if (current) openImport(current)
  }

  function navigateWorkspace(page: AppPage) {
    clearProductPage(); setHomeMetric(null); setSearchDetail(null); setActive(page); setMobileNav(false)
    window.scrollTo(0, 0)
  }

  return (
    <OrderActivityContext.Provider value={(!productSelection || productSelection.scope === 'CURRENT') ? cohortFinancials?.orders ?? [] : []}><ProductCostEditorContext.Provider value={{ costs, normalizeSku: skuNormalizer, pending: costDraft !== appliedCostDraft, manageCosts: () => navigateWorkspace('Costs'), preview: setCostDraft, cancelPreview: cancelCostPreview, save: record => { const next = setProductCost(costs, record, skuNormalizer); updateCosts(next); setCostDraft(null) } }}><AdvertisingRecoveryContext.Provider value={{ shared: sharedAdvertisingDates, financial: { from: dateExtent.min ?? '', to: dateExtent.max ?? '' }, onUseDates: viewSponsoredProducts, onOpenReports: () => navigateWorkspace('Reports') }}><AppShell syncStatus={<AutomaticReportStatus orderCycle delivery={automaticDelivery} enabled={automaticEnabled} issues={automaticIssues} onAutomatic={() => { automaticIdentity.current = null; deliveryMode(true) }} onManual={() => { deliveryMode(false); setActive('Reports') }} />} search={dataset ? <ReportSearch key={currentImportId ?? fileName} productScopeLabel={periodChoice === 'ALL' ? 'all report dates' : `selected dates: ${advertisingDateRange(fromDate, toDate)}`} documents={searchDocuments} onSelect={result => result.kind === 'PRODUCT' && result.sku ? openSearchProduct(result.sku) : setSearchDetail(result)} /> : null} active={productSelection ? 'Products' : active} mobileNavOpen={mobileNav} reportName={fileName} reportLoaded={Boolean(effectiveDataset)} onToggleMobileNav={() => setMobileNav((value) => !value)} onNavigate={navigateWorkspace}><Suspense fallback={<p className="workspace-loading" role="status">Opening workspace…</p>}>


      {selectedProduct && productSelection ? <ProductPage key={`${productSelection.scope}:${productSelection.sku}`} product={selectedProduct} backLabel={active === 'Home' ? 'Dashboard' : active === 'Data & Settings' ? 'Settings' : active === 'Costs' ? 'Product costs' : active} advertisingProduct={selectedAdProduct} sponsored={reportAdvertising} title={searchDocuments.find(document => document.kind === 'PRODUCT' && document.sku === selectedProduct.sku)?.label} basis={productSelection.scope === 'REPORT' ? 'All report dates · Transactions by posting date' : `${advertisingDateRange(fromDate, toDate)} · ${productSelection.scope === 'POSTED' ? 'Transactions by posting date' : 'Orders by purchase date'}`} formatMoney={money} onBack={closeProductPage} /> : null}
      {productSelection && !selectedProduct ? <section className="product-page" aria-label="Product profile"><button className="text-btn" onClick={closeProductPage}>← Back to products</button><h1>{productSelection.sku}</h1><p>{dataset ? 'This product is not available in the selected financial view. Search the whole report or choose another period.' : 'Loading your saved report…'}</p></section> : null}
      <div className="workspace-list-view" hidden={Boolean(productSelection)}>
      {hostedDelivery ? <HostedAmazonConnection onUseAutomatic={() => deliveryMode(true)} range={requestedFromDate && requestedToDate ? { from: requestedFromDate, to: requestedToDate } : null} /> : null}
      {costDraft ? <div className="cost-preview-banner" role="status">Live cost preview · Changes are not saved yet.</div> : null}
      {active !== 'Tools' && active !== 'Reports'  && active !== 'Data & Settings' && active !== 'Costs' && dataset ? <GlobalFilters source={dataset.source} fulfillmentTypes={fulfillmentTypes} fulfillmentType={requestedFulfillmentFilter} fromDate={requestedFromDate} toDate={requestedToDate} minDate={automaticEnabled && currentImportId?.startsWith('api:') ? undefined : dateExtent.min} maxDate={automaticEnabled && currentImportId?.startsWith('api:') ? new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10) : dateExtent.max} period={periodChoice} periods={comparisonPeriods} onFulfillmentTypeChange={value => { setFilterUpdatePending(true); setFulfillmentFilter(value) }} onFromDateChange={value => { setFilterUpdatePending(true); if (automaticEnabled && currentImportId?.startsWith('api:')) setPeriodChoice('CUSTOM'); setFromDate(value) }} onToDateChange={value => { setFilterUpdatePending(true); if (automaticEnabled && currentImportId?.startsWith('api:')) setPeriodChoice('CUSTOM'); setToDate(value) }} onPeriodChange={applyPeriod} onClear={() => { setFilterUpdatePending(true); setFulfillmentFilter(''); setPeriodChoice('ALL'); setFromDate(dateExtent.min ?? ''); setToDate(dateExtent.max ?? ''); setAdvertisingDateUndo(null) }} /> : null}
      {active === 'Tools' ? <ToolsPage /> : active === 'Costs' ? <><PageHeader eyebrow="Workspace" title="Product costs" description="Set unit costs once and reuse them across reports." /><CostMaster events={allEvents} costs={costs} onSave={updateCosts} missingCostPolicy={missingCostPolicy} onMissingCostPolicyChange={setMissingCostPolicy} normalizeSku={skuNormalizer} /></> : active === 'Advertising' ? <><PageHeader eyebrow="Analytics" title="Advertising" description="Reported spend and sales credited to ads, with source evidence for every product." /><DashboardAdvertising report={sponsoredAttribution} postedGrossSales={baseAdvertisingSummary.grossSales} formatMoney={advertisingMoney} />{showAdvertisingDateUndo ? <div className="advertising-date-confirmation" role="status"><span>Showing business and advertising results for {advertisingDateRange(fromDate, toDate)}.</span><button className="text-btn" onClick={undoAdvertisingDates}>Undo</button></div> : null}<ProductPerformanceList full rows={sellerProducts} mode="ADVERTISING" basis="Orders by purchase date · ads by report date" dateLabel={advertisingDateRange(fromDate, toDate)} formatMoney={advertisingMoney} onSelect={openSellerProduct} /></> : active === 'Products' ? dataset ? <><PageHeader eyebrow="Analytics" title="Products" description="Compare performance, find the product, and manage its costs in one place." /><ProductPerformanceList full rows={sellerProducts} mode={sponsoredAttribution.status === 'AVAILABLE' ? 'ADVERTISING' : 'FINANCIAL'} basis={sponsoredAttribution.status === 'AVAILABLE' ? 'Orders by purchase date · ads by report date' : 'Orders by purchase date'} dateLabel={advertisingDateRange(fromDate, toDate)} formatMoney={advertisingMoney} onSelect={openSellerProduct} /></> : <ReportRequired area="Products" onOpenReports={() => setActive('Reports')}>Upload a sales report to understand the profit, costs, fees, and returns for each product.</ReportRequired> : active === 'Returns' ? dataset ? <ReturnAnalysis summary={returnSummary} formatMoney={money} onSelectSku={openOrders} fileName={fileName} products={sellerProducts} /> : <ReportRequired area="Returns" onOpenReports={() => setActive('Reports')}>Upload a report to separate RTO from customer returns and find products or locations with return problems.</ReportRequired> : active === 'Reports' ? <ReportsPage dataset={effectiveDataset} rawDataset={rawDataset} importing={importing} importError={importError} fileName={fileName} imports={imports} currentImportId={currentImportId} leftId={comparisonLeftId} rightId={comparisonRightId} comparison={importComparison} qualityCenter={qualityCenter} cohort={orderCohort} reportMinDate={dateExtent.min} reportMaxDate={dateExtent.max} formatMoney={money} classificationRules={classificationRules} sponsoredAttribution={sponsoredAttribution} sponsoredReport={sponsoredReport} sponsoredImporting={sponsoredImporting} sponsoredError={sponsoredError} onViewSponsored={viewSponsoredProducts} onSponsoredFile={onSponsoredFile} onFile={onFile} onLeftChange={setComparisonLeftId} onRightChange={setComparisonRightId} onOpen={openImport} onSaveClassificationRule={saveRule} onDeleteClassificationRule={deleteRule} onQualityAction={handleQualityAction} /> : active === 'Data & Settings' ? <DataSettingsPage events={allEvents} costs={costs} missingCostPolicy={missingCostPolicy} normalizeSku={skuNormalizer} importCount={imports.length} ruleCount={classificationRules.length} onSaveCosts={updateCosts} onMissingCostPolicyChange={setMissingCostPolicy} onExportBackup={() => downloadBackup({ imports, costs, classificationRules })} onRestoreBackup={importBackup} /> : <>
          <PageHeader eyebrow="Business overview" title="Business overview" description="Sales, profit and product performance for your selected period." action={<>{dataset ? <>
            {reimbursementSummary.totalClaimsCount > 0 ? <button className="secondary" onClick={() => setReimbursementModalOpen(true)}>Claim refunds (₹{reimbursementSummary.totalEligibleAmount.toLocaleString('en-IN')})</button> : null}
            <button className="secondary" onClick={() => setRestockModalOpen(true)}>Restock alerts</button>
            <button className="secondary" onClick={() => setCashFlowModalOpen(true)}>Cash flow</button>
            <button className="secondary" onClick={exportAuditWorkbook}>Export audit workbook</button>
          </> : null}{!dataset ? <button className="secondary" onClick={() => setActive('Reports')}>Upload report</button> : null}</>} />
          {isAutomaticPreparing || filtersUpdating ? <DashboardSkeleton /> : <>
          {!dataset ? <section className="welcome-empty"><img className="welcome-logo" src={`${import.meta.env.BASE_URL}brand/azulia-logo.webp`} alt="Azulia" width="112" height="112" /><h2>Get your first trustworthy profit view</h2><ol className="welcome-steps"><li><b>Upload</b><span>Choose your marketplace CSV or TSV report.</span></li><li><b>Review</b><span>Confirm reconciliation and unfamiliar transactions.</span></li><li><b>Add costs</b><span>Complete or explicitly estimate product costs.</span></li><li><b>Analyze</b><span>Trace Dashboard → SKU → order evidence.</span></li></ol><button className="primary" onClick={() => setActive('Reports')}>Upload your first report</button><small>Your data stays in this browser. Profit remains an estimate until cost coverage is complete.</small></section> : null}
          {dataset ? <>
          {orderCohort ? <OrderCohortSummary cohort={orderCohort} salePeriodView postedCount={postedRecordCount} syncing={hostedDelivery ? hostedState.busy : automaticDelivery.status?.state === 'syncing'} onReview={() => setCohortSnapshotOpen(true)} /> : null}
          {pulseScoreboard ? <PulseScoreboard scoreboard={pulseScoreboard} onSelectPeriod={(from, to) => { setFilterUpdatePending(true); setFromDate(from); setToDate(to); setPeriodChoice('CUSTOM') }} /> : null}
          {profitLeakAlerts.length ? <ProfitLeakAlerts alerts={profitLeakAlerts} onSelectSku={sku => openSearchProduct(sku)} /> : null}
          <div className="section-label"><span>Business snapshot</span><small>Primary metrics</small></div>
          {!costStatus.complete ? <div className="profit-status" role="status"><span>{missingCostPolicy === 'ASSUME_ZERO' ? 'Estimated profit · missing product costs are assumed ₹0.' : 'Profit is incomplete until product costs are added.'}</span><button className="text-btn" onClick={() => setActive('Costs')}>Add missing costs →</button></div> : null}
          <section className="kpi-grid primary-kpis">
            <KpiCard label="Profit so far" value={dataset && costStatus.profitReady ? money(profitAfterAds) : '—'} tone={profitAfterAds >= 0 ? 'positive' : 'negative'} note="Recorded activity, including deferred amounts; excludes settlements." hint={costStatus.complete ? 'Includes booked advertising expense' : missingCostPolicy === 'ASSUME_ZERO' ? 'Estimated · missing costs assumed ₹0' : 'Add missing product costs'} onClick={() => setHomeMetric('PROFIT')} />
            <KpiCard label="Gross sales" value={dataset ? money(summary.grossSales) : '—'} tone="positive" hint="Positive product-sale events" onClick={() => setHomeMetric('GROSS_SALES')} />
            <KpiCard label="Profit margin" value={dataset && costStatus.profitReady ? `${profitMargin.toFixed(2)}%` : '—'} tone={profitMargin >= 0 ? 'positive' : 'negative'} hint="Business profit ÷ gross sales" onClick={() => setHomeMetric('PROFIT_MARGIN')} />

            <KpiCard label="Return rate" value={dataset ? `${summary.returnRate.toFixed(2)}%` : '—'} tone={summary.returnRate > 15 ? 'negative' : 'neutral'} hint={`${summary.returnQuantity.toLocaleString('en-IN')} returned units`} onClick={() => setHomeMetric('RETURN_RATE')} />

          </section>

          {focusAnalysis ? <FocusPriorities area={focusArea} onAreaChange={setFocusArea} analysis={focusAnalysis} dateLabel={advertisingDateRange(fromDate, toDate)} financialBasis="Orders by purchase date" sponsored={sponsoredAttribution} formatMoney={advertisingMoney} products={sellerProducts} onOpenProduct={(sku) => { openProductPage({ sku, scope: 'CURRENT' }, { page:active, metric:null }); setHomeMetric(null) }} /> : null}

          <section className="dashboard-checks" aria-label="Report checks">
            <span className={costStatus.complete ? 'check-ready' : 'check-review'}>{costStatus.coveragePercent.toFixed(0)}% cost coverage</span>
            {dataset?.source !== 'amazon' && (effectiveDataset?.quality.unclassifiedEventCount ?? 0) > 0 ? (
              <button onClick={() => setActive('Reports')}>{effectiveDataset?.quality.unclassifiedEventCount} transactions need review →</button>
            ) : null}
            <span title="Complete imported report; not a guarantee of classification or cost accuracy">{effectiveDataset?.quality.reconciliation.reconciled ? 'Source totals reconciled' : 'Review source totals'}</span>
          </section>
          <section className="workspace-overview-grid"><LineChart data={trend} onSelectPoint={date => { setFilterUpdatePending(true); setFromDate(date); setToDate(date); setPeriodChoice('CUSTOM'); setHomeMetric('GROSS_SALES') }} /><FinancialSummary rows={business.financialRows} profit={costStatus.profitReady ? profitAfterAds : null} estimated={!costStatus.complete} formatMoney={money} /></section>

          {orderCohort ? <LiveOrderList cohort={orderCohort} /> : null}
          <ProductPerformanceList mode={sponsoredAttribution.status === 'AVAILABLE' ? 'ADVERTISING' : 'FINANCIAL'} onViewAll={() => setActive('Products')} rows={sellerProducts} basis={sponsoredAttribution.status === 'AVAILABLE' ? 'Orders by purchase date · ads by report date' : 'Orders by purchase date'} dateLabel={advertisingDateRange(fromDate, toDate)} formatMoney={advertisingMoney} onSelect={openSellerProduct} />
          {showAdvertisingDateUndo ? <div className="advertising-date-confirmation" role="status"><span>Showing business and advertising results for {advertisingDateRange(fromDate, toDate)}.</span><button className="text-btn" onClick={undoAdvertisingDates}>Undo</button></div> : null}
          <DashboardAdvertising report={sponsoredAttribution} postedGrossSales={baseAdvertisingSummary.grossSales} formatMoney={advertisingMoney} />

          <details className="more-metrics"><summary><span><strong>More financial details</strong><small>Revenue, costs, fees and advertising</small></span><b>Show details</b></summary><section className="kpi-grid secondary-kpis">
            <KpiCard label="Orders" value={business.orderCount.toLocaleString('en-IN')} tone="accent" hint="All known orders purchased in this period, including those awaiting financial details" note="See the order list for status and financial availability." />
            <KpiCard label="Net product revenue" value={money(summary.netProductRevenue)} tone="positive" hint="Sales less product refunds" onClick={() => setHomeMetric('NET_REVENUE')} />
            <KpiCard label="Net COGS" value={costStatus.profitReady ? money(costStatus.netCogs) : '—'} tone="negative" hint={costStatus.complete ? 'Good returns reverse COGS' : `${costStatus.missingSkus.length} product costs missing`} onClick={() => setHomeMetric('NET_COGS')} />
            <KpiCard label="Booked advertising expense" value={money(summary.adsSpend)} tone="accent" hint={`Total sales / booked ad expense: ${summary.roas.toFixed(2)}× · Not attributed Ad ROAS`} onClick={() => setHomeMetric('ADS')} />
            <KpiCard label="Marketplace charges" value={money(summary.marketplaceCharges)} tone="negative" hint="Excludes Easy Ship and ads" onClick={() => setHomeMetric('MARKETPLACE_CHARGES')} />
            <KpiCard label="Net Easy Ship fee" value={money(summary.netEasyShipFee)} tone="negative" hint="Charges less reversals" onClick={() => setHomeMetric('EASY_SHIP')} />
            <KpiCard label="Refund value" value={money(summary.refundValue)} tone="negative" hint="Product revenue refunded" onClick={() => setHomeMetric('REFUNDS')} />
            <KpiCard label="Reimbursements" value={money(summary.reimbursements)} tone="positive" hint="Net reimbursement events" onClick={() => setHomeMetric('REIMBURSEMENTS')} />
            <KpiCard label="Average selling price" value={money(summary.averageSellingPrice)} hint="Gross sales ÷ sold quantity" onClick={() => setHomeMetric('ASP')} />
            <KpiCard label="Profit before ads" value={costStatus.profitReady ? money(profitBeforeAds) : '—'} tone={profitBeforeAds >= 0 ? 'positive' : 'negative'} hint={`ROI ${roi.toFixed(2)}% after ads`} onClick={() => setHomeMetric('PROFIT_BEFORE_ADS')} />
            <KpiCard label="Profit per delivered unit" value={unitEconomics.profitPerDeliveredUnit === null ? '—' : money(unitEconomics.profitPerDeliveredUnit)} tone={(unitEconomics.profitPerDeliveredUnit ?? 0) >= 0 ? 'positive' : 'negative'} hint={unitEconomics.profitPerDeliveredUnit === null ? 'Needs complete costs and delivered units' : 'Business profit ÷ net delivered units'} onClick={() => setHomeMetric('PROFIT_PER_DELIVERED_UNIT')} />
            <KpiCard label="Break-even TACOS" value={unitEconomics.breakEvenTacos === null ? '—' : `${unitEconomics.breakEvenTacos.toFixed(2)}%`} tone={unitEconomics.breakEvenTacos === null ? 'neutral' : summary.tacos <= unitEconomics.breakEvenTacos ? 'positive' : 'negative'} hint={unitEconomics.breakEvenTacos === null ? 'Needs complete costs and gross sales' : `Current TACOS ${summary.tacos.toFixed(2)}%`} onClick={() => setHomeMetric('BREAK_EVEN_TACOS')} />
            <KpiCard label="Fee audit" value="Review charges" hint="Open an evidence-based fee review" onClick={() => setFeeAuditOpen(true)} />
          </section>
          {accountCharges.length ? <details className="seller-disclosure"><summary>Account charges</summary><small className="seller-footnote">Included in business profit · Not allocated to individual products</small><div className="table-scroll"><table><thead><tr><th>Charge / adjustment</th><th>Amount</th><th>Status</th></tr></thead><tbody>{accountCharges.map((item, index) => <tr key={index}><td>{item.label}</td><td>{advertisingMoney(item.amount)}</td><td>{item.classified ? 'Included' : 'Included · Needs review'}</td></tr>)}</tbody></table></div></details> : null}
          </details>

          <details className="seller-disclosure"><summary>Where the money went</summary><ProfitBridge format={money} profit={profitAfterAds} items={[
            { label: 'Gross sales', value: summary.grossSales, kind: 'income' },
            { label: 'Product refunds', value: -summary.refundValue, kind: 'cost' },
            { label: 'Marketplace charges', value: -summary.marketplaceCharges, kind: 'cost' },
            { label: 'Net Easy Ship fee', value: -summary.netEasyShipFee, kind: 'cost' },
            { label: 'Advertising', value: -summary.adsSpend, kind: 'cost' },
            { label: 'Reimbursements', value: summary.reimbursements, kind: 'income' },
            { label: 'Tax included', value: summary.taxNet, kind: 'adjustment' },
            { label: 'Other operating adjustments', value: otherOperating, kind: 'adjustment' },
            { label: 'Net COGS', value: -costStatus.netCogs, kind: 'cost' },
          ]} /></details>



          </> : null}
          </>}
          </>}
      </div>
      </Suspense></AppShell>
      {searchDetail ? <ReportSearchDetail key={`${searchDetail.kind}:${searchDetail.id}`} document={searchDetail} events={allEvents} orders={searchOrders} formatMoney={money} onOpenProduct={openSearchProduct} onClose={() => { setSearchDetail(null); cancelCostPreview() }} /> : null}

      {homeMetricResult ? <MetricSkuDrilldown result={homeMetricResult} products={productProfitability} previousProducts={previousProductProfitability} sponsored={sponsoredAttribution} advertisingProducts={advertisingProducts} comparisonPeriod={periodChoice} onSelectProduct={sku => openOrders(sku)} financialBasis="Orders by purchase date" formatMoney={money} onClose={() => setHomeMetric(null)} /> : null}
      {feeAuditOpen ? <FeeAuditPanel result={feeAudit} orders={orders} formatMoney={money} onClose={() => setFeeAuditOpen(false)} /> : null}
      {cohortSnapshotOpen && orderCohort && cohortFinancials ? <OrderLifecycleSnapshot cohort={orderCohort} formatMoney={money} onClose={() => setCohortSnapshotOpen(false)} /> : null}
      {reimbursementModalOpen && reimbursementSummary ? <ReimbursementFinderModal summary={reimbursementSummary} onClose={() => setReimbursementModalOpen(false)} /> : null}
      {restockModalOpen && restockPredictions ? <RestockPredictorModal restockList={restockPredictions} onClose={() => setRestockModalOpen(false)} /> : null}
      {cashFlowModalOpen && cashFlowForecast ? <CashFlowForecastModal forecast={cashFlowForecast} onClose={() => setCashFlowModalOpen(false)} /> : null}
    </AdvertisingRecoveryContext.Provider></ProductCostEditorContext.Provider></OrderActivityContext.Provider>
  )
}
