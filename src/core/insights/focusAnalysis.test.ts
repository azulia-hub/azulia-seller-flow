import { describe, expect, it } from 'vitest'
import { buildFocusAnalysis, rankFocus, rankAdvertisingEfficiency, rankAdvertisingLosses } from './focusAnalysis'

describe('focus concentration', () => {
  it('calculates the actual 80 percent group without assuming a fixed 20 percent split', () => {
    const rows = [{ id:'a', label:'A', value:60 }, { id:'b', label:'B', value:20 }, { id:'c', label:'C', value:20 }]
    const snapshot = JSON.stringify(rows)
    const result = rankFocus(rows)
    expect(result).toMatchObject({ total:100, targetCount:2, targetShare:80, topFifthCount:1, topFifthShare:60 })
    expect(result.targetPopulationShare).toBeCloseTo(200 / 3)
    expect(result.rows.map(row => row.priority)).toEqual([true,true,false])
    expect(JSON.stringify(rows)).toBe(snapshot)
  })
  it('ranks product and return money leaks by absolute loss despite higher rates on smaller losses', () => {
    const result = buildFocusAnalysis({
      products:[
        { sku:'small-high-rate', sales:100, profitBeforeAds:-90, profitAfterAds:-90, missingCost:false, returnRate:90 },
        { sku:'large-low-rate', sales:10000, profitBeforeAds:-1000, profitAfterAds:-1000, missingCost:false, returnRate:5 },
      ],
      returns:[
        { sku:'small-high-rate', loss:90, missingCost:false },
        { sku:'large-low-rate', loss:600, missingCost:false },
        { sku:'large-low-rate', loss:400, missingCost:false },
      ], ads:[], unmatchedAds:[], campaigns:[], from:'', to:'', advertisingAvailable:false,
    })
    for (const area of ['LOSSES','RETURNS'] as const) {
      expect(result[area].rows.map(row => row.sku)).toEqual(['large-low-rate','small-high-rate'])
      expect(result[area].rows[0].value).toBe(1000)
    }
  })
  it('includes reported ads once and retains booked SKU ads when report attribution is unavailable', () => {
    const input = {
      products:[
        { sku:'reported', sales:500, profitBeforeAds:100, profitAfterAds:80, missingCost:false, returnRate:0 },
        { sku:'booked', sales:500, profitBeforeAds:50, profitAfterAds:-70, missingCost:false, returnRate:0 },
        { sku:'unknown', sales:500, profitBeforeAds:-10, profitAfterAds:-10, missingCost:false, returnRate:0 },
      ],
      ads:[{ sku:'reported', spend:300, attributedSales:500, profitAfterAds:-200 }, { sku:'unknown', spend:20, attributedSales:50, profitAfterAds:null }],
      returns:[], unmatchedAds:[], campaigns:[], from:'', to:'', advertisingAvailable:true,
    }
    const result = buildFocusAnalysis(input).LOSSES
    expect(result.rows.map(row => [row.sku,row.value])).toEqual([['reported',200],['booked',70]])
    expect(result.excluded).toBe(1)
    expect(buildFocusAnalysis({ ...input, advertisingAvailable:false }).LOSSES.rows.map(row => [row.sku,row.value])).toEqual([['booked',70],['unknown',10]])
  })
  it('ranks profit, marketplace charges and net shipping independently by amount', () => {
    const result = buildFocusAnalysis({ products:[
      { sku:'A', sales:1000, profitBeforeAds:400, profitAfterAds:300, marketplaceCharges:50, easyShipCharges:200, missingCost:false, returnRate:10 },
      { sku:'B', sales:1000, profitBeforeAds:500, profitAfterAds:200, marketplaceCharges:300, easyShipCharges:100, fulfillmentFees:120, missingCost:false, returnRate:20 },
    ], returns:[], ads:[], campaigns:[], unmatchedAds:[], from:'', to:'', advertisingAvailable:false })
    expect(result.PROFIT.rows.map(row => [row.sku,row.value])).toEqual([['A',300],['B',200]])
    expect(result.MARKETPLACE.rows).toEqual([])
    expect(result.SHIPPING.rows).toEqual([])
  })
  it('shows marketplace charges only for products losing money after supported ads', () => {
    const result = buildFocusAnalysis({ products:[
      { sku:'profitable', sales:1000, profitBeforeAds:100, profitAfterAds:50, marketplaceCharges:500, easyShipCharges:900, fulfillmentFees:900, missingCost:false, returnRate:0 },
      { sku:'ads-loss', sales:1000, profitBeforeAds:100, profitAfterAds:80, marketplaceCharges:200, easyShipCharges:400, fulfillmentFees:80, missingCost:false, returnRate:0 },
      { sku:'booked-loss', sales:1000, profitBeforeAds:-20, profitAfterAds:-50, marketplaceCharges:300, easyShipCharges:100, fulfillmentFees:120, missingCost:false, returnRate:0 },
      { sku:'unknown', sales:1000, profitBeforeAds:-20, profitAfterAds:-50, marketplaceCharges:900, easyShipCharges:1000, missingCost:true, returnRate:0 },
    ], ads:[{ sku:'ads-loss', spend:200, attributedSales:500, profitAfterAds:-100 }], returns:[], unmatchedAds:[], campaigns:[], from:'', to:'', advertisingAvailable:true })
    expect(result.MARKETPLACE.rows.map(row => [row.sku,row.value])).toEqual([['booked-loss',300],['ads-loss',200]])
    expect(result.MARKETPLACE.excluded).toBe(1)
    expect(result.SHIPPING.rows.map(row => [row.sku,row.value])).toEqual([['ads-loss',400],['booked-loss',100]])
    expect(result.SHIPPING.excluded).toBe(1)
    expect(result.FULFILLMENT.rows.map(row => [row.sku,row.value])).toEqual([['booked-loss',120],['ads-loss',80]])
  })
  it('ignores nonpositive and nonfinite values without producing invalid ratios', () => {
    expect(rankFocus([{ id:'a', label:'A', value:0 }, { id:'b', label:'B', value:-1 }, { id:'c', label:'C', value:NaN }])).toMatchObject({ total:0, rows:[], targetCount:0, targetShare:0, topFifthShare:0 })
    expect(rankFocus([]).targetPopulationShare).toBe(0)
    expect(rankFocus([{ id:'a', label:'A', value:5 }])).toMatchObject({ targetCount:1, targetShare:100 })
  })
  it('separates losses from profits, guards missing costs and reviews unmatched spend without sales', () => {
    const result = buildFocusAnalysis({
      products:[
        { sku:'A', sales:100, profitBeforeAds:-20, profitAfterAds:-20, missingCost:false, returnRate:10 },
        { sku:'B', sales:200, profitBeforeAds:100, profitAfterAds:100, missingCost:false, returnRate:0 },
        { sku:'C', sales:50, profitBeforeAds:-500, profitAfterAds:-500, missingCost:true, returnRate:20 },
      ],
      returns:[{ sku:'A', loss:10, missingCost:false }, { sku:'A', loss:5, missingCost:false }, { sku:'C', loss:500, missingCost:true }, { sku:null, loss:4, missingCost:false }],
      ads:[{ sku:'A', spend:20, attributedSales:45, profitAfterAds:-20 }], unmatchedAds:[{ sku:'unknown', spend:10 }],
      campaigns:[{ campaign:'Campaign', portfolio:'P', sku:'A', date:'2026-09-01', spend:20, attributedSales:45 }, { campaign:'Campaign', portfolio:'P', sku:'unknown', date:'2026-09-02', spend:10, attributedSales:0 }, { campaign:'Campaign', portfolio:'P', sku:'A', date:'2026-08-01', spend:999, attributedSales:999 }],
      from:'2026-09-01', to:'2026-09-30', advertisingAvailable:true,
    })
    expect(result.LOSSES).toMatchObject({ total:20, excluded:1 })
    expect(result.RETURNS).toMatchObject({ total:15, excluded:2 })
    expect(result.ADS.total).toBe(0)
    expect(result.ADS.adLosses).toEqual({ total:20, count:1, unknownCount:1 })
    expect(result.ADS.rows.some(row => row.sku === 'A')).toBe(false)
    expect(result.ADS.rows.find(row => row.label.includes('unmatched'))?.sku).toBeUndefined()
    expect(result.CAMPAIGNS).toMatchObject({ total:0, population:1 })
  })
  it('summarizes verified losses after ads without treating unavailable profit as zero', () => {
    const result = buildFocusAnalysis({ products:[], returns:[], campaigns:[], unmatchedAds:[], ads:[
      { sku:'A', spend:50, attributedSales:20, profitAfterAds:-40 },
      { sku:'B', spend:20, attributedSales:50, profitAfterAds:80 },
      { sku:'C', spend:10, attributedSales:0, profitAfterAds:null },
    ], from:'2026-09-01', to:'2026-09-30', advertisingAvailable:true })
    expect(result.ADS.adLosses).toEqual({ total:40, count:1, unknownCount:1 })
  })
  it('requires both TACOS strictly above 20 percent and a known loss, ranking by loss amount', () => {
    const result = rankAdvertisingLosses([
      { id:'boundary', label:'Boundary', value:0, totalSales:100, adSpend:20, sales:10, profitAfterAds:-50 },
      { id:'profit', label:'Profit', value:0, totalSales:100, adSpend:30, sales:10, profitAfterAds:5 },
      { id:'small', label:'Small', value:0, totalSales:100, adSpend:50, sales:10, profitAfterAds:-10 },
      { id:'large', label:'Large', value:0, totalSales:1000, adSpend:210, sales:900, profitAfterAds:-100 },
      { id:'zero', label:'Zero', value:0, totalSales:0, adSpend:50, profitAfterAds:-50 },
      { id:'unknown', label:'Unknown', value:0, totalSales:100, adSpend:50, profitAfterAds:null },
    ])
    expect(result.rows.map(row => [row.id,row.value,row.tacos])).toEqual([['large',100,21],['small',10,50]])
    expect(result.total).toBe(110)
    expect(result.excluded).toBe(2)
  })
  it('does not flag a large budget when its sales share supports it', () => {
    const result = rankAdvertisingEfficiency([
      { id:'A', label:'A', value:400, adSpend:400, sales:2000 },
      { id:'B', label:'B', value:300, adSpend:300, sales:1500 },
      { id:'C', label:'C', value:200, adSpend:200, sales:1000 },
      { id:'D', label:'D', value:100, adSpend:100, sales:500 },
    ])
    expect(result.rows).toEqual([])
  })
  it('ranks weaker sales output, zero sales and known product losses for review', () => {
    const result = rankAdvertisingEfficiency([
      { id:'A', label:'A', value:400, adSpend:400, sales:4000 },
      { id:'B', label:'B', value:300, adSpend:300, sales:50 },
      { id:'C', label:'C', value:200, adSpend:200, sales:300 },
      { id:'D', label:'D', value:100, adSpend:100, sales:0 },
    ])
    expect(result.rows.map(row => row.id)).toEqual(['B','C','D'])
    expect(result.total).toBe(600)
    expect(result.rows[0]).toMatchObject({ spendShare:30, reviewReason:'Ad spend exceeds ad-attributed sales' })
    expect(result.rows[2].reviewReason).toBe('Spend without ad-attributed sales')
    const unknown = rankAdvertisingEfficiency([{ id:'missing', label:'Missing evidence', value:10, adSpend:10 }])
    expect(unknown).toMatchObject({ total:0, excluded:1 })
    const losses = rankAdvertisingEfficiency([{ id:'loss', label:'Loss', value:10, adSpend:10, sales:100, profitAfterAds:-5 }])
    expect(losses.rows[0].reviewReason).toBe('Product loses money after ads')
  })
  it('reviews weak campaigns within the selected dates and retains unmatched source products', () => {
    const result = buildFocusAnalysis({ products:[], returns:[], ads:[], unmatchedAds:[], campaigns:[
      { campaign:'Weak', portfolio:'P', sku:'unknown', date:'2026-09-01', spend:20, attributedSales:0 },
      { campaign:'Healthy', portfolio:'P', sku:'other', date:'2026-09-01', spend:10, attributedSales:100 },
      { campaign:'Weak', portfolio:'P', sku:'unknown', date:'2026-08-01', spend:999, attributedSales:9999 },
    ], from:'2026-09-01', to:'2026-09-30', advertisingAvailable:true })
    expect(result.CAMPAIGNS).toMatchObject({ total:20, population:2 })
    expect(result.CAMPAIGNS.rows[0]).toMatchObject({ sales:0, reviewReason:'Spend without ad-attributed sales' })
    expect(result.CAMPAIGNS.rows[0].children?.[0].sku).toBeUndefined()
  })
  it('links campaign SKU aliases only to unambiguous financial identities', () => {
    const input = { products:[], returns:[], ads:[], unmatchedAds:[], from:'2026-09-01', to:'2026-09-30', advertisingAvailable:true,
      normalizeSku:(value:string) => value.replaceAll('-CHANNEL',''), financialSkus:['A'],
      campaigns:[{ campaign:'Weak', portfolio:'', sku:'A-CHANNEL', date:'2026-09-01', spend:100, attributedSales:0 }],
    }
    expect(buildFocusAnalysis(input).CAMPAIGNS.rows[0].children?.[0].sku).toBe('A')
    expect(buildFocusAnalysis({ ...input, financialSkus:['A','A-CHANNEL','A-CHANNEL-CHANNEL'], campaigns:[{ ...input.campaigns[0],sku:'A-CHANNEL-CHANNEL-CHANNEL' }] }).CAMPAIGNS.rows[0].children?.[0].sku).toBeUndefined()
  })
  it('withholds ad and campaign results when coverage is unavailable', () => {
    const result = buildFocusAnalysis({ products:[], returns:[], ads:[{ sku:'A', spend:100, attributedSales:200, profitAfterAds:30 }], unmatchedAds:[], campaigns:[], from:'', to:'', advertisingAvailable:false })
    expect(result.ADS.rows).toEqual([])
    expect(result.CAMPAIGNS.rows).toEqual([])
  })
})
