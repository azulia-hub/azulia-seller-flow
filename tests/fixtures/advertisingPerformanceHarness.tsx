import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AdvertisingWorkspace } from '../../src/app/advertising/AdvertisingWorkspace'
import type { AdsConnection } from '../../src/app/useAdsConnection'
import type { SponsoredProductsReport } from '../../src/core/advertising/types'
import '../../src/styles/global.css'
import '../../src/styles/theme.css'
import '../../src/styles/workspace.css'
const report: SponsoredProductsReport = { id: 'ads-api:123', fileName: 'Synthetic performance fixture', importedAt: '2026-11-22T00:00:00Z', minDate: '2026-11-01', maxDate: '2026-11-21', rows: Array.from({ length: 3000 }, (_, index) => ({ date: '2026-11-10', advertisedSku: 'SKU', advertisedAsin: 'B000000001', campaign: 'Campaign', adGroup: 'Group', portfolio: '', spendExcludingTax: 1, attributedSales: 5, advertisedSkuSales: 4, otherSkuSales: 1, impressions: 20, clicks: 2, orders: 1, units: 1, raw: { campaignId: 'c', adGroupId: 'g', adId: String(index) } })) }
const connection: AdsConnection = { supported: true, enabled: true, status: { configured: true, renewalConfigured: true, verified: true, accountName: 'Synthetic', profileId: '123', sellerId: 'SELLER123', state: 'idle', revision: 1, lastSync: report.importedAt, error: null, from: report.minDate, to: report.maxDate, rows: report.rows.length, pending: 0 }, error: null, useAutomatic() {}, requestRange: async () => {}, refresh: async () => {} }
const events = [], costs = [], names = new Map([['SKU', 'Synthetic product']])
function Harness() {
 const [tick, setTick] = useState(0)
 useEffect(() => { const timer=setInterval(()=>setTick(value=>value+1),250); return ()=>clearInterval(timer) },[])
 return <main style={{padding:16}}><span data-testid="heartbeat">{tick}</span><AdvertisingWorkspace report={report} events={events} costs={costs} policy="BLOCK" financialFrom={null} financialTo={null} financialCompatible={false} financialIdentity="synthetic" from={report.minDate} to={report.maxDate} productNames={names} connection={connection} onOpenSettings={()=>{}} onOpenFinancialProduct={()=>{}} formatMoney={value=>`₹${value.toFixed(2)}`} /></main>
}
createRoot(document.getElementById('root')!).render(<Harness />)
