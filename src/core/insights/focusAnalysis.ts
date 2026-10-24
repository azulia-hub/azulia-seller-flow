export type FocusArea = 'PROFIT' | 'MARKETPLACE' | 'SHIPPING' | 'FULFILLMENT' | 'SALES' | 'LOSSES' | 'RETURNS' | 'ADS' | 'CAMPAIGNS'
export interface FocusItem {
  id: string; label: string; value: number; sku?: string
  marketplaceCharges?:number; easyShipCharges?:number; sales?: number; adSpend?: number; returnRate?: number; profitAfterAds?: number | null
  tacos?: number; totalSales?: number; returnValue?: number; cogsRecovered?: number
  spendShare?: number; salesShare?: number; roas?: number | null; acos?: number | null; reviewReason?: string
  children?: readonly FocusItem[]
}
export interface FocusRow extends FocusItem { share: number; cumulativeShare: number; cumulativeValue: number; priority: boolean }
export interface FocusResult {
  adLosses?: { total:number; count:number; unknownCount:number }
  rows: readonly FocusRow[]; total: number; population: number; contributors: number
  targetTotal: number; targetSales?: number; targetAdSpend?: number; targetReturnValue?: number; targetCogsRecovered?: number
  targetCount: number; targetShare: number; targetPopulationShare: number
  topFifthCount: number; topFifthPopulationShare: number; topFifthShare: number; excluded: number
}
/** Positive amounts only: losses cannot be offset by profitable products. */
export function rankFocus(items: readonly FocusItem[], population = items.length, excluded = 0): FocusResult {
  const positive = items.filter(item => Number.isFinite(item.value) && item.value > 0).sort((a,b) => b.value - a.value || a.id.localeCompare(b.id))
  const total = positive.reduce((sum,item) => sum + item.value, 0)
  let cumulative = 0
  const targetIndex = total > 0 ? positive.findIndex(item => { cumulative += item.value; return cumulative / total >= .8 - 1e-12 }) : -1
  const targetCount = targetIndex >= 0 ? targetIndex + 1 : 0
  cumulative = 0
  const rows = positive.map((item,index) => { cumulative += item.value; return { ...item, share:item.value / total * 100, cumulativeShare:Math.min(100,cumulative / total * 100), cumulativeValue:cumulative, priority:index < targetCount } })
  const topFifthCount = Math.min(rows.length, Math.ceil(population * .2))
  const targetItems = positive.slice(0,targetCount)
  const sumKnown = (key:'sales'|'adSpend'|'returnValue'|'cogsRecovered') => targetItems.length && targetItems.every(item => Number.isFinite(item[key])) ? targetItems.reduce((sum,item) => sum + item[key]!,0) : undefined
  return { rows, total, population, contributors:rows.length, targetTotal:rows[targetCount - 1]?.cumulativeValue ?? 0,
    targetSales:sumKnown('sales'), targetAdSpend:sumKnown('adSpend'), targetReturnValue:sumKnown('returnValue'), targetCogsRecovered:sumKnown('cogsRecovered'),
    targetCount, targetShare:rows[targetCount - 1]?.cumulativeShare ?? 0,
    targetPopulationShare:population > 0 ? targetCount / population * 100 : 0, topFifthCount, topFifthPopulationShare:population > 0 ? topFifthCount / population * 100 : 0, topFifthShare:rows[topFifthCount - 1]?.cumulativeShare ?? 0, excluded }
}
/** Compare budget with sales output before ranking review candidates by spend. */
export function rankAdvertisingEfficiency(items: readonly FocusItem[]): FocusResult {
  const known = items.filter(item => Number.isFinite(item.adSpend) && item.adSpend! >= 0 && Number.isFinite(item.sales) && item.sales! >= 0)
  const totalSpend = known.reduce((sum,item) => sum + item.adSpend!,0)
  const totalSales = known.reduce((sum,item) => sum + item.sales!,0)
  const flagged: FocusItem[] = []
  for (const item of known) {
    const spend = item.adSpend!, sales = item.sales!
    if (spend <= 0) continue
    const spendShare = totalSpend > 0 ? spend / totalSpend * 100 : 0
    const salesShare = totalSales > 0 ? sales / totalSales * 100 : 0
    const reason = sales === 0 ? 'Spend without ad-attributed sales'
      : spend > sales ? 'Ad spend exceeds ad-attributed sales'
      : item.profitAfterAds != null && item.profitAfterAds < 0 ? 'Product loses money after ads'
      : spendShare > salesShare + 1e-8 ? 'More budget share than sales share' : null
    if (reason) flagged.push({ ...item, value:spend, spendShare, salesShare, roas:spend > 0 ? sales / spend : null, acos:sales > 0 ? spend / sales * 100 : null, reviewReason:reason })
  }
  return rankFocus(flagged,known.length,items.length - known.length)
}
/** Strict threshold: undefined TACOS or profit cannot establish an advertising money leak. */
export function rankAdvertisingLosses(items: readonly FocusItem[]): FocusResult {
  const known = items.filter(item => Number.isFinite(item.totalSales) && item.totalSales! > 0 && Number.isFinite(item.adSpend) && item.adSpend! >= 0 && item.profitAfterAds != null && Number.isFinite(item.profitAfterAds))
  return rankFocus(known.filter(item => item.adSpend! / item.totalSales! > .2 && item.profitAfterAds! < 0).map(item => ({
    ...item, value:-item.profitAfterAds!, tacos:item.adSpend! / item.totalSales! * 100,
    roas:item.adSpend! > 0 && item.sales !== undefined ? item.sales / item.adSpend! : null,
    reviewReason:'TACOS above 20% and loss after ads',
  })), items.length, items.length - known.length)
}
export interface FocusProduct { fulfillmentFees?:number; marketplaceCharges?:number; easyShipCharges?:number; sku:string; name?:string; sales:number; profitBeforeAds:number; profitAfterAds?:number; missingCost:boolean; returnRate:number }
export interface FocusAd { marketplaceCharges?:number; easyShipCharges?:number; sku:string; spend:number; attributedSales:number; totalSales?:number; profitAfterAds:number | null }
export interface FocusCampaignEvent { campaign:string; portfolio:string; sku:string; date:string; spend:number; attributedSales:number }
export function buildFocusAnalysis(input: {
  financialSkus?:readonly string[]
  normalizeSku?:(sku:string) => string
  products:readonly FocusProduct[]
  returns:readonly { sku:string | null; loss:number; missingCost:boolean; refundValue?:number; cogsRecovered?:number }[]
  ads:readonly FocusAd[]
  unmatchedAds:readonly { sku:string; spend:number }[]
  campaigns:readonly FocusCampaignEvent[]
  from:string; to:string; advertisingAvailable:boolean
}): Record<FocusArea, FocusResult> {
  const identities = new Map(input.products.map(product => [product.sku,product]))
  const financialSkus = new Set(input.financialSkus ?? input.products.map(product => product.sku))
  const identityKey = (sku:string) => (input.normalizeSku?.(sku) ?? sku).trim()
  const canonical = new Map<string,string[]>()
  for (const sku of financialSkus) {
    const key = identityKey(sku), values = canonical.get(key)
    if (values) values.push(sku); else canonical.set(key,[sku])
  }
  const financialSku = (source:string) => {
    if (financialSkus.has(source)) return source
    const matches = canonical.get(identityKey(source))
    return matches?.length === 1 ? matches[0] : undefined
  }
  const ads = new Map(input.ads.map(ad => [ad.sku,ad]))
  const productItem = (sku:string, value:number): FocusItem => {
    const product = identities.get(sku), ad = ads.get(sku)
    return { id:sku, sku, label:product?.name || sku, value, sales:product?.sales, returnRate:product?.returnRate, adSpend:ad?.spend, profitAfterAds:product?.missingCost ? null : input.advertisingAvailable && ad ? ad.profitAfterAds : product?.profitAfterAds, marketplaceCharges:product?.marketplaceCharges, easyShipCharges:product?.easyShipCharges }
  }
  const returnGroups = new Map<string, { loss:number; refundValue:number; cogsRecovered:number; missing:boolean }>()
  let unattributedReturns = 0
  for (const item of input.returns) {
    if (!item.sku) { unattributedReturns++; continue }
    const group = returnGroups.get(item.sku) ?? { loss:0, refundValue:0, cogsRecovered:0, missing:false }
    group.loss += item.loss; group.refundValue += item.refundValue ?? 0; group.cogsRecovered += item.cogsRecovered ?? 0; group.missing ||= item.missingCost
    returnGroups.set(item.sku,group)
  }
  const sourceSales = new Map<string,number>()
  const campaigns = new Map<string, { label:string; spend:number; sales:number; products:Map<string, { spend:number; sales:number }> }>()
  if (input.advertisingAvailable) for (const item of input.campaigns) {
    if (item.date < input.from || item.date > input.to) continue
    sourceSales.set(item.sku,(sourceSales.get(item.sku) ?? 0) + item.attributedSales)
    const id = JSON.stringify([item.portfolio,item.campaign])
    const group = campaigns.get(id) ?? { label:[item.campaign || 'Unnamed campaign',item.portfolio].filter(Boolean).join(' · '), spend:0, sales:0, products:new Map() }
    group.spend += item.spend; group.sales += item.attributedSales
    const product = group.products.get(item.sku) ?? { spend:0, sales:0 }
    product.spend += item.spend; product.sales += item.attributedSales
    group.products.set(item.sku,product); campaigns.set(id,group)
  }
  const campaignItems = [...campaigns].map(([id,group]): FocusItem => ({ id, label:group.label, value:group.spend, adSpend:group.spend, sales:group.sales,
    children:[...group.products].map(([sku,product]) => ({ id:sku || '(unidentified)', sku:financialSku(sku), label:sku || 'Unidentified product', value:product.spend, adSpend:product.spend, sales:product.sales })).sort((a,b) => b.value - a.value || a.id.localeCompare(b.id)) }))
  const adItems: FocusItem[] = input.advertisingAvailable ? input.ads.map(ad => ({ ...productItem(ad.sku,ad.spend), sales:ad.attributedSales, totalSales:ad.totalSales, marketplaceCharges:ad.marketplaceCharges, easyShipCharges:ad.easyShipCharges })) : []
  if (input.advertisingAvailable) for (const ad of input.unmatchedAds) adItems.push({ id:JSON.stringify(['unmatched',ad.sku]), label:`${ad.sku || 'Unidentified product'} (unmatched)`, value:ad.spend, adSpend:ad.spend, sales:sourceSales.get(ad.sku) })
  // Matched report economics already restore booked SKU ads before deducting report spend once.
  // Otherwise retain only the advertising actually booked against this SKU.
  const lossProducts = input.products.map(product => {
    const ad = input.advertisingAvailable ? ads.get(product.sku) : undefined
    const profit = ad ? ad.profitAfterAds : product.profitAfterAds
    return { product, profit:product.missingCost || profit == null || !Number.isFinite(profit) ? null : profit }
  })
  return {
    PROFIT:rankFocus(lossProducts.filter(item => item.profit !== null).map(item => productItem(item.product.sku,Math.max(0,item.profit!))), input.products.length, lossProducts.filter(item => item.profit === null).length),
    MARKETPLACE:rankFocus(lossProducts.filter(item => item.profit !== null && item.profit < 0).map(item => productItem(item.product.sku,item.product.marketplaceCharges ?? 0)), input.products.length, lossProducts.filter(item => item.profit === null).length),
    FULFILLMENT:rankFocus(lossProducts.filter(item => item.profit !== null && item.profit < 0).map(item => productItem(item.product.sku,item.product.fulfillmentFees ?? 0)), input.products.length, lossProducts.filter(item => item.profit === null).length),
    SHIPPING:rankFocus(lossProducts.filter(item => item.profit !== null && item.profit < 0).map(item => productItem(item.product.sku,item.product.easyShipCharges ?? 0)), input.products.length, lossProducts.filter(item => item.profit === null).length),
    SALES:rankFocus(input.products.map(product => productItem(product.sku,product.sales))),
    LOSSES:rankFocus(lossProducts.filter(item => item.profit !== null).map(item => productItem(item.product.sku,Math.max(0,-item.profit!))), input.products.length, lossProducts.filter(item => item.profit === null).length),
    RETURNS:rankFocus([...returnGroups].filter(([,group]) => !group.missing).map(([sku,group]) => ({ ...productItem(sku,group.loss), returnValue:group.refundValue, cogsRecovered:group.cogsRecovered })), returnGroups.size, [...returnGroups.values()].filter(group => group.missing).length + unattributedReturns),
    ADS:{ ...rankAdvertisingLosses(adItems), adLosses:input.advertisingAvailable ? {
      total:input.ads.reduce((sum,item) => sum + (item.profitAfterAds !== null && item.profitAfterAds < 0 ? -item.profitAfterAds : 0),0),
      count:input.ads.filter(item => item.profitAfterAds !== null && item.profitAfterAds < 0).length,
      unknownCount:input.ads.filter(item => item.profitAfterAds === null).length + input.unmatchedAds.length,
    } : undefined }, CAMPAIGNS:rankAdvertisingEfficiency(campaignItems),
  }
}
