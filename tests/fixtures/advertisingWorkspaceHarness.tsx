import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AdvertisingWorkspaceView } from '../../src/features/advertising-workspace/ui/AdvertisingWorkspaceView'
import type {
  AdvertisingDetailModel,
  AdvertisingEntity,
  AdvertisingGroup,
  AdvertisingViewQuery,
  AdvertisingWorkspaceModel,
} from '../../src/features/advertising-workspace/contract'
import '../../src/styles/global.css'
import '../../src/styles/theme.css'
import '../../src/styles/workspace.css'

const initialGroups: AdvertisingGroup[] = [
  {
    id: 'grp-tables',
    name: 'Living Room Tables',
    version: 1,
    origin: 'MANUAL',
    productIds: ['27-I31F-NB1O', 'SKU-TABLE-02'],
  },
  {
    id: 'grp-beds',
    name: 'Bedding Family',
    version: 2,
    origin: 'CATALOG',
    parentId: 'B0BEDPARENT',
    productIds: ['SKU-BED-01', 'SKU-BED-02'],
  },
]

const sampleDetail: AdvertisingDetailModel = {
  entity: { kind: 'CAMPAIGN', id: 'camp-1' },
  title: 'SPA_Penetration_mix_erp',
  subtitle: 'Portfolio: Penetration Mix · Sponsored Products',
  summary: [
    {
      id: 'spend',
      label: 'Campaign Spend',
      value: 1250.4,
      format: 'MONEY',
      definition: 'Reported ad spend for this campaign before GST.',
      change: { value: 12.5, unit: 'PERCENT', favorable: false },
    },
    {
      id: 'attributedSales',
      label: 'Attributed Sales',
      value: 8400.0,
      format: 'MONEY',
      definition: '7-day click-attributed sales credited to this campaign.',
      change: { value: 24.0, unit: 'PERCENT', favorable: true },
    },
    {
      id: 'acos',
      label: 'ACOS',
      value: 14.88,
      format: 'PERCENT',
      definition: 'Spend divided by attributed sales.',
      change: { value: -1.4, unit: 'PERCENTAGE_POINTS', favorable: true },
    },
    {
      id: 'roas',
      label: 'ROAS',
      value: 6.72,
      format: 'MULTIPLIER',
      definition: 'Attributed sales divided by spend.',
      change: { value: 0.6, unit: 'ABSOLUTE', favorable: true },
    },
    {
      id: 'tacos',
      label: 'TACOS',
      value: null,
      format: 'PERCENT',
      definition: 'TACOS requires campaign-wide total product sales.',
      unavailableReason: 'Unavailable for single campaign',
      change: null,
    },
  ],
  metrics: {
    spend: 1250.4,
    attributedSales: 8400.0,
    promotedSales: 7500.0,
    otherProductSales: 900.0,
    impressions: 14200,
    clicks: 185,
    purchases: 14,
    units: 16,
    acos: 14.88,
    roas: 6.72,
    cpc: 6.76,
    ctr: 1.3,
    conversionRate: 7.57,
    totalProductSales: null,
    tacos: null,
    profitAfterAds: null,
  },
  campaigns: [],
  products: [
    {
      entity: { kind: 'PRODUCT', id: '27-I31F-NB1O' },
      name: 'Solid Teak Coffee Table',
      subtitle: '27-I31F-NB1O · B0GL4W3VTV',
      metrics: {
        spend: 850.4,
        attributedSales: 5400.0,
        promotedSales: 4500.0,
        otherProductSales: 900.0,
        impressions: 9800,
        clicks: 120,
        purchases: 8,
        units: 9,
        acos: 15.75,
        roas: 6.35,
        cpc: 7.09,
        ctr: 1.22,
        conversionRate: 6.67,
        totalProductSales: 18500.0,
        tacos: 4.6,
        profitAfterAds: 3400.0,
      },
      change: null,
      status: 'ACTIVE',
      relatedCampaigns: 2,
    },
  ],
  searchTerms: [
    {
      entity: { kind: 'SEARCH_TERM', id: 'term-1' },
      name: 'teak wood coffee table',
      subtitle: 'Ad Group: Living Room Prime',
      target: 'coffee table',
      matchType: 'EXACT',
      attributionScope: 'DIRECT',
      metrics: {
        spend: 420.0,
        attributedSales: 3600.0,
        promotedSales: 3600.0,
        otherProductSales: 0,
        impressions: 4200,
        clicks: 65,
        purchases: 6,
        units: 6,
        acos: 11.67,
        roas: 8.57,
        cpc: 6.46,
        ctr: 1.55,
        conversionRate: 9.23,
        totalProductSales: null,
        tacos: null,
        profitAfterAds: null,
      },
      change: null,
      status: null,
    },
  ],
  targets: [
    {
      id: 'tgt-1',
      name: 'coffee table',
      matchType: 'EXACT',
      status: 'ENABLED',
      configuredBid: 14.5,
      bidSource: 'TARGET',
      observedAt: '2026-11-19',
      metrics: {
        spend: 650.0,
        attributedSales: 4800.0,
        promotedSales: 4800.0,
        otherProductSales: 0,
        impressions: 6800,
        clicks: 95,
        purchases: 8,
        units: 9,
        acos: 13.54,
        roas: 7.38,
        cpc: 6.84,
        ctr: 1.4,
        conversionRate: 8.42,
        totalProductSales: null,
        tacos: null,
        profitAfterAds: null,
      },
    },
    {
      id: 'tgt-2',
      name: 'living room center table',
      matchType: 'PHRASE',
      status: 'ENABLED',
      configuredBid: 12.0,
      bidSource: 'AD_GROUP_DEFAULT',
      observedAt: '2026-11-19',
      metrics: {
        spend: 600.4,
        attributedSales: 3600.0,
        promotedSales: 2700.0,
        otherProductSales: 900.0,
        impressions: 7400,
        clicks: 90,
        purchases: 6,
        units: 7,
        acos: 16.68,
        roas: 6.0,
        cpc: 6.67,
        ctr: 1.22,
        conversionRate: 6.67,
        totalProductSales: null,
        tacos: null,
        profitAfterAds: null,
      },
    },
  ],
  crossSales: [
    {
      id: 'cs-1',
      advertisedProduct: '27-I31F-NB1O',
      purchasedProduct: 'SKU-TABLE-02',
      relationship: 'SIBLING',
      attributedSales: 900.0,
      units: 1,
      evidence: 'Purchased sibling variant within 7-day click attribution window.',
    },
  ],
  trend: [
    {
      date: '2026-11-14',
      metrics: {
        spend: 210.0,
        attributedSales: 1400.0,
        promotedSales: 1400.0,
        otherProductSales: 0,
        impressions: 2400,
        clicks: 30,
        purchases: 2,
        units: 2,
        acos: 15.0,
        roas: 6.67,
        cpc: 7.0,
        ctr: 1.25,
        conversionRate: 6.67,
        totalProductSales: null,
        tacos: null,
        profitAfterAds: null,
      },
    },
    {
      date: '2026-11-15',
      metrics: {
        spend: 260.0,
        attributedSales: 1800.0,
        promotedSales: 1800.0,
        otherProductSales: 0,
        impressions: 2900,
        clicks: 38,
        purchases: 3,
        units: 3,
        acos: 14.44,
        roas: 6.92,
        cpc: 6.84,
        ctr: 1.31,
        conversionRate: 7.89,
        totalProductSales: null,
        tacos: null,
        profitAfterAds: null,
      },
    },
  ],
  notices: [
    'Recent 7-day conversion lag applies to this campaign.',
    'Bid adjustments are active for Top of Search (+25%).',
  ],
  availableSections: ['summary', 'targets', 'crossSales', 'products', 'searchTerms'],
}

function Harness() {
  const [query, setQuery] = useState<AdvertisingViewQuery>({
    view: 'overview',
    from: '2026-10-20',
    to: '2026-11-18',
    scope: { kind: 'ACCOUNT' },
    search: '',
    sort: 'SPEND',
    direction: 'DESC',
    page: 1,
  })

  const [refreshCount, setRefreshCount] = useState(0)
  const [detail, setDetail] = useState<AdvertisingDetailModel | null>(null)
  const [groups, setGroups] = useState<AdvertisingGroup[]>(initialGroups)
  const [lastSavedGroup, setLastSavedGroup] = useState<string | null>(null)
  const [lastFinancialNav, setLastFinancialNav] = useState<string | null>(null)
  const [settingsOpened, setSettingsOpened] = useState(false)

  const model: AdvertisingWorkspaceModel = {
    advertiser: 'RoyalFurnitures53',
    marketplace: 'Amazon India',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    adProductLabel: 'Sponsored Products only',
    query,
    availableViews: [
      { id: 'overview', label: 'Overview' },
      { id: 'campaigns', label: 'Campaigns' },
      { id: 'products', label: 'Products' },
      { id: 'searchTerms', label: 'Search terms' },
    ],
    sourceState: 'READY',
    error: null,
    refreshing: false,
    lastUpdated: '2026-11-19T10:20:00.000Z',
    coveredFrom: '2026-10-20',
    coveredTo: '2026-11-18',
    basisLabel: 'Spend before GST · 7-day click attribution',
    comparisonLabel: 'vs. previous 30 days',
    notices: ['Recent 7-day conversion lag: latest dates may receive additional click attribution.'],
    summary: [
      {
        id: 'spend',
        label: 'Ad spend',
        value: 12450.5,
        format: 'MONEY',
        definition: 'Reported ad spend before GST for the selected period.',
        change: { value: 5.2, unit: 'PERCENT', favorable: false },
      },
      {
        id: 'attributedSales',
        label: 'Attributed sales',
        value: 68400.0,
        format: 'MONEY',
        definition: 'Total sales credited to advertising within the 7-day click attribution window.',
        change: { value: 14.8, unit: 'PERCENT', favorable: true },
      },
      {
        id: 'acos',
        label: 'ACOS',
        value: 18.2,
        format: 'PERCENT',
        definition: 'Reported ad spend divided by total attributed sales.',
        change: { value: -1.6, unit: 'PERCENTAGE_POINTS', favorable: true },
      },
      {
        id: 'roas',
        label: 'ROAS',
        value: 5.49,
        format: 'MULTIPLIER',
        definition: 'Attributed sales divided by reported ad spend.',
        change: { value: 0.42, unit: 'ABSOLUTE', favorable: true },
      },
      {
        id: 'tacos',
        label: 'TACOS',
        value: 6.8,
        format: 'PERCENT',
        definition: 'Reported ad spend divided by compatible financial product sales.',
        change: { value: -0.5, unit: 'PERCENTAGE_POINTS', favorable: true },
      },
    ],
    findings: [
      {
        id: 'find-1',
        title: 'Spend without purchases',
        explanation: 'Campaign SPA_Beds_Broad has 15 clicks and ₹450 spend with 0 attributed sales.',
        entity: { kind: 'CAMPAIGN', id: 'camp-3' },
        evidence: [
          'Clicks: 15, Spend: ₹450.00, Purchases: 0',
          'Observation period: 2026-10-20 to 2026-11-18',
        ],
        severity: 'REVIEW',
      },
      {
        id: 'find-2',
        title: 'ACOS shift',
        explanation: 'Campaign SPA_Tables_Exact increased from 14.2% to 22.8% ACOS.',
        entity: { kind: 'CAMPAIGN', id: 'camp-2' },
        evidence: [
          'Current period ACOS: 22.8%',
          'Comparison period ACOS: 14.2% (+8.6 pp)',
        ],
        severity: 'REVIEW',
      },
    ],
    trend: [
      {
        date: '2026-11-12',
        metrics: {
          spend: 410.0,
          attributedSales: 2200.0,
          promotedSales: 2000.0,
          otherProductSales: 200.0,
          impressions: 4800,
          clicks: 62,
          purchases: 4,
          units: 5,
          acos: 18.64,
          roas: 5.37,
          cpc: 6.61,
          ctr: 1.29,
          conversionRate: 6.45,
          totalProductSales: 6100.0,
          tacos: 6.72,
          profitAfterAds: 1200.0,
        },
      },
      {
        date: '2026-11-13',
        metrics: {
          spend: 380.0,
          attributedSales: 2400.0,
          promotedSales: 2200.0,
          otherProductSales: 200.0,
          impressions: 4500,
          clicks: 58,
          purchases: 5,
          units: 5,
          acos: 15.83,
          roas: 6.32,
          cpc: 6.55,
          ctr: 1.29,
          conversionRate: 8.62,
          totalProductSales: 6400.0,
          tacos: 5.94,
          profitAfterAds: 1450.0,
        },
      },
      {
        date: '2026-11-14',
        metrics: {
          spend: 450.0,
          attributedSales: 2100.0,
          promotedSales: 1900.0,
          otherProductSales: 200.0,
          impressions: 5200,
          clicks: 70,
          purchases: 4,
          units: 4,
          acos: 21.43,
          roas: 4.67,
          cpc: 6.43,
          ctr: 1.35,
          conversionRate: 5.71,
          totalProductSales: 5900.0,
          tacos: 7.63,
          profitAfterAds: 980.0,
        },
      },
    ],
    campaigns: [
      {
        entity: { kind: 'CAMPAIGN', id: 'camp-1' },
        name: 'SPA_Penetration_mix_erp',
        subtitle: 'Portfolio: Penetration Mix',
        status: 'ENABLED',
        metrics: {
          spend: 5400.0,
          attributedSales: 32000.0,
          promotedSales: 29000.0,
          otherProductSales: 3000.0,
          impressions: 64000,
          clicks: 820,
          purchases: 64,
          units: 70,
          acos: 16.88,
          roas: 5.93,
          cpc: 6.59,
          ctr: 1.28,
          conversionRate: 7.8,
          totalProductSales: null,
          tacos: null,
          profitAfterAds: null,
        },
        change: { value: -2.1, unit: 'PERCENTAGE_POINTS', favorable: true },
        note: 'Consistent conversion in top targets.',
      },
      {
        entity: { kind: 'CAMPAIGN', id: 'camp-2' },
        name: 'SPA_Tables_Exact',
        subtitle: 'Portfolio: Living Room',
        status: 'ENABLED',
        metrics: {
          spend: 4200.0,
          attributedSales: 18400.0,
          promotedSales: 16000.0,
          otherProductSales: 2400.0,
          impressions: 48000,
          clicks: 580,
          purchases: 36,
          units: 38,
          acos: 22.83,
          roas: 4.38,
          cpc: 7.24,
          ctr: 1.21,
          conversionRate: 6.21,
          totalProductSales: null,
          tacos: null,
          profitAfterAds: null,
        },
        change: { value: 8.6, unit: 'PERCENTAGE_POINTS', favorable: false },
        note: 'ACOS rising over the last 14 days.',
      },
      {
        entity: { kind: 'CAMPAIGN', id: 'camp-3' },
        name: 'SPA_Beds_Broad',
        subtitle: 'Portfolio: Bedroom',
        status: 'PAUSED',
        metrics: {
          spend: 450.0,
          attributedSales: 0,
          promotedSales: 0,
          otherProductSales: 0,
          impressions: 12000,
          clicks: 15,
          purchases: 0,
          units: 0,
          acos: null,
          roas: 0,
          cpc: 30.0,
          ctr: 0.13,
          conversionRate: 0,
          totalProductSales: null,
          tacos: null,
          profitAfterAds: null,
        },
        change: null,
        note: 'Zero sales recorded.',
      },
    ],
    products: [
      {
        entity: { kind: 'PRODUCT', id: '27-I31F-NB1O' },
        name: 'Solid Teak Coffee Table',
        subtitle: '27-I31F-NB1O · B0GL4W3VTV',
        status: 'ACTIVE',
        relatedCampaigns: 2,
        metrics: {
          spend: 5400.0,
          attributedSales: 32000.0,
          promotedSales: 29000.0,
          otherProductSales: 3000.0,
          impressions: 64000,
          clicks: 820,
          purchases: 64,
          units: 70,
          acos: 16.88,
          roas: 5.93,
          cpc: 6.59,
          ctr: 1.28,
          conversionRate: 7.8,
          totalProductSales: 84000.0,
          tacos: 6.43,
          profitAfterAds: 18400.0,
        },
        change: null,
      },
      {
        entity: { kind: 'PRODUCT', id: 'SKU-TABLE-02' },
        name: 'Compact Nesting End Table',
        subtitle: 'SKU-TABLE-02 · B0NESTTABLE',
        status: 'ACTIVE',
        relatedCampaigns: 1,
        metrics: {
          spend: 1800.0,
          attributedSales: 12400.0,
          promotedSales: 11000.0,
          otherProductSales: 1400.0,
          impressions: 22000,
          clicks: 290,
          purchases: 22,
          units: 25,
          acos: 14.52,
          roas: 6.89,
          cpc: 6.21,
          ctr: 1.32,
          conversionRate: 7.59,
          totalProductSales: 28000.0,
          tacos: 6.43,
          profitAfterAds: 6200.0,
        },
        change: null,
      },
    ],
    searchTerms: [
      {
        entity: { kind: 'SEARCH_TERM', id: 'term-1' },
        name: 'teak wood coffee table',
        subtitle: 'SPA_Penetration_mix_erp · Living Room Prime',
        target: 'coffee table',
        matchType: 'EXACT',
        attributionScope: 'DIRECT',
        metrics: {
          spend: 1840.0,
          attributedSales: 12600.0,
          promotedSales: 12600.0,
          otherProductSales: 0,
          impressions: 18400,
          clicks: 280,
          purchases: 25,
          units: 26,
          acos: 14.6,
          roas: 6.85,
          cpc: 6.57,
          ctr: 1.52,
          conversionRate: 8.93,
          totalProductSales: null,
          tacos: null,
          profitAfterAds: null,
        },
        change: null,
        status: null,
      },
      {
        entity: { kind: 'SEARCH_TERM', id: 'term-2' },
        name: 'wooden folding study desk',
        subtitle: 'SPA_Tables_Exact · Desks',
        target: 'folding desk',
        matchType: 'BROAD',
        attributionScope: 'SHARED_AD_GROUP',
        metrics: {
          spend: 940.0,
          attributedSales: 4800.0,
          promotedSales: 4000.0,
          otherProductSales: 800.0,
          impressions: 14200,
          clicks: 140,
          purchases: 8,
          units: 9,
          acos: 19.58,
          roas: 5.11,
          cpc: 6.71,
          ctr: 0.99,
          conversionRate: 5.71,
          totalProductSales: null,
          tacos: null,
          profitAfterAds: null,
        },
        change: null,
        status: null,
      },
    ],
    groups,
    productChoices: [
      { id: '27-I31F-NB1O', name: 'Solid Teak Coffee Table' },
      { id: 'SKU-TABLE-02', name: 'Compact Nesting End Table' },
      { id: 'SKU-BED-01', name: 'King Size Sheesham Bed' },
      { id: 'SKU-BED-02', name: 'Queen Size Sheesham Bed' },
    ],
    totalRows: 3,
    pageSize: 10,
    detail,
  }

  const repairMode = new URLSearchParams(location.search).has('repairs')
  const image = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect x="8" y="8" width="64" height="64" fill="%23bd9650"/%3E%3C/svg%3E'
  const longTitle = 'Azulia solid wood bedside table with storage and detailed product information '.repeat(8)
  const fixtureRecommendation = { action: 'LOWER' as const, text: 'Consider a small bid reduction', reason: 'Illustrative mature ACOS is above the explicitly selected review target.', suggestedBid: 9 }
  const displayModel = repairMode ? { ...model,
    products: model.products.map((row, index) => index ? row : { ...row, name: longTitle, imageUrl: image, imageAsin: 'B012345678', recommendation: fixtureRecommendation }),
    searchTerms: model.searchTerms.map((row, index) => index ? row : { ...row, name: 'B087654321', imageUrl: image, imageAsin: 'B087654321', recommendation: fixtureRecommendation }),
    detail: model.detail ? { ...model.detail, title: longTitle, imageUrl: image, imageAsin: 'B012345678', crossSales: model.detail.crossSales.map(row => ({ ...row, advertisedImageUrl: image, purchasedImageUrl: image })) } : null,
  } : model

  const formatMoney = (n: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(n)

  const handleSaveGroup = async (input: {
    id?: string
    name: string
    productIds: readonly string[]
  }) => {
    setLastSavedGroup(input.name)
    if (input.id) {
      setGroups(prev =>
        prev.map(g =>
          g.id === input.id
            ? { ...g, name: input.name, productIds: input.productIds, version: g.version + 1 }
            : g
        )
      )
    } else {
      const newGroup: AdvertisingGroup = {
        id: `grp-${Date.now()}`,
        name: input.name,
        version: 1,
        origin: 'MANUAL',
        productIds: input.productIds,
      }
      setGroups(prev => [...prev, newGroup])
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 1400, margin: '0 auto' }}>
      <AdvertisingWorkspaceView
        model={displayModel}
        formatMoney={formatMoney}
        onQueryChange={patch => setQuery(prev => ({ ...prev, ...patch }))}
        onOpenEntity={() => setDetail(sampleDetail)}
        onCloseDetail={() => setDetail(null)}
        onRefresh={() => setRefreshCount(c => c + 1)}
        onOpenSettings={() => setSettingsOpened(true)}
        onOpenFinancialProduct={id => setLastFinancialNav(id)}
        onSaveGroup={handleSaveGroup}
      />
      {/* Test diagnostics */}
      <div style={{ marginTop: 20, fontSize: 11, color: '#888' }}>
        <span data-testid="harness-refresh-count">{refreshCount}</span>
        <span data-testid="harness-saved-group">{lastSavedGroup || 'none'}</span>
        <span data-testid="harness-financial-nav">{lastFinancialNav || 'none'}</span>
        <span data-testid="harness-settings-status">{settingsOpened ? 'opened' : 'closed'}</span>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Harness />)
