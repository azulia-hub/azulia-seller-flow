import { indexOrderHistory, selectOrderCohort } from './orderLifecycle'
import { isCustomerRefund } from './dashboardSummary'
import type { CanonicalFinancialEvent } from '../data/types'
import type { ProductCost } from '../costs/types'
import type { MissingCostPolicy } from '../costs/calculateCosts'
import { canonicalDateKey, isCustomerSale } from './dashboardSummary'
import { buildBusinessOverview } from './businessOverview'
import { productImage, productTitles } from '../search/productTitles'
import { toIndiaDateString, indiaDateToUtcIso, getIndiaToday } from '../sync/planner'
import { missingRanges, type SyncRange } from '../sync/ranges'

export type PulseOrderStatusCategory = 'CONFIRMED' | 'UNSHIPPED' | 'PENDING' | 'CANCELED'

export interface PulseOrderSummary {
  readonly orderId: string
  readonly purchaseDate: string
  readonly rawStatus: string
  readonly statusCategory: PulseOrderStatusCategory
  readonly orderValue: number
  readonly isSettled: boolean
  readonly skus: readonly string[]
  readonly fulfillmentType?: string | null
  readonly productTitle?: string | null
  readonly imageUrl?: string | null
  readonly isValueEstimated?: boolean
}

export interface PulsePeriodMetrics {
  readonly label: string
  readonly from: string
  readonly to: string
  readonly grossSales: number
  readonly netEarnings: number
  readonly profitReady: boolean
  readonly estimatedPendingSales: number
  readonly profitRows: readonly { label: string; value: number|null }[]
  readonly financialRows: readonly { label: string; value: number }[]
  readonly excludedOrderRecords: number
  readonly missingPriceOrders: number
  readonly awaitingFinancialOrders: number
  readonly pendingSales: number
  readonly totalSales: number
  readonly netProfit: number
  readonly profitMargin: number
  readonly ordersCount: number
  readonly pendingOrdersCount: number
  readonly confirmedOrdersCount: number
  readonly unshippedOrdersCount: number
  readonly unitsSold: number
  readonly returnUnits: number
  readonly orders: readonly PulseOrderSummary[]
  readonly isPartialCoverage?: boolean
}

export interface PulseScoreboard {
  readonly today: PulsePeriodMetrics
  readonly yesterday: PulsePeriodMetrics
  readonly thisMonth: PulsePeriodMetrics
  readonly forecast: PulsePeriodMetrics
  readonly anchorDate: string
}

export interface PulseSourceOrder {
  readonly orderId: string
  readonly purchaseDate: string
  readonly status?: string | null
  readonly orderValue?: string | number | null
  readonly fulfillmentType?: string | null
  readonly sku?: string | null
  readonly asin?: string | null
  readonly title?: string | null
  readonly imageUrl?: string | null
  readonly items?: readonly { asin?: string | null; sku?: string | null; title?: string | null; quantity?: number | null; price?: string | null; currency?: string | null }[]
}

export interface PulseScoreboardInput {
  readonly events: readonly CanonicalFinancialEvent[]
  readonly costs: readonly ProductCost[]
  readonly missingCostPolicy: MissingCostPolicy
  readonly normalizeSku?: (sku: string) => string
  readonly sourceOrders?: readonly PulseSourceOrder[]
  readonly anchorDate?: string
  readonly purchaseCoverage?: readonly SyncRange[]
  readonly includeCustomerTax?: boolean
  readonly estimateMissingPrices?: boolean
}

export function computePulseScoreboard(input: PulseScoreboardInput): PulseScoreboard {
  const anchorDate = input.anchorDate ?? getIndiaToday()
  const yesterdayDate = toIndiaDateString(Date.parse(anchorDate) - 86400000) ?? anchorDate
  const monthStart = `${anchorDate.slice(0, 7)}-01`

  // Precompute product titles, images, SKU prices, and fulfillment channel AOVs
  const orderTitleMap = new Map<string, string>()
  const skuTitleMap = new Map<string, string>()
  const asinTitleMap = new Map<string, string>()
  const orderImageMap = new Map<string, string>()
  const skuImageMap = new Map<string, string>()
  const asinImageMap = new Map<string, string>()
  const skuPriceMap = new Map<string, { total: number; count: number }>()

  const ordersByDate = new Map<string, PulseSourceOrder[]>()
  for (const order of input.sourceOrders ?? []) {
    if (!order.orderId || !order.purchaseDate) continue
    const dateKey = canonicalDateKey(order.purchaseDate) ?? order.purchaseDate.slice(0, 10)
    const list = ordersByDate.get(dateKey) ?? []
    list.push(order)
    ordersByDate.set(dateKey, list)
    if (order.title) {
      if (!orderTitleMap.has(order.orderId)) orderTitleMap.set(order.orderId, order.title)
      if (order.sku && !skuTitleMap.has(order.sku)) skuTitleMap.set(order.sku, order.title)
      if (order.asin && !asinTitleMap.has(order.asin)) asinTitleMap.set(order.asin, order.title)
    }
    if (order.imageUrl) {
      if (!orderImageMap.has(order.orderId)) orderImageMap.set(order.orderId, order.imageUrl)
      if (order.sku && !skuImageMap.has(order.sku)) skuImageMap.set(order.sku, order.imageUrl)
      if (order.asin && !asinImageMap.has(order.asin)) asinImageMap.set(order.asin, order.imageUrl)
    }
  }

  let fbaRevenue = 0
  let fbaOrderCount = 0
  let fbmRevenue = 0
  let fbmOrderCount = 0

  const orderSalesRecorded = new Map<string, number>()
  const orderChannelRecorded = new Map<string, string>()

  for (const event of input.events) {
    const img = productImage([event])
    if (img) {
      if (event.orderId && !orderImageMap.has(event.orderId)) orderImageMap.set(event.orderId, img)
      if (event.sku && !skuImageMap.has(event.sku)) skuImageMap.set(event.sku, img)
      const asin = typeof event.raw?.['asin'] === 'string' ? event.raw['asin'].trim() : undefined
      if (asin && !asinImageMap.has(asin)) asinImageMap.set(asin, img)
    }

    const title = (event.raw?.['product title'] as string)
      || productTitles([event])[0]
      || (event.descriptionIsProductTitle !== false ? event.rawDescription : undefined)
    if (title && title.trim()) {
      const clean = title.trim()
      if (event.orderId && !orderTitleMap.has(event.orderId)) {
        orderTitleMap.set(event.orderId, clean)
      }
      if (event.sku && !skuTitleMap.has(event.sku)) {
        skuTitleMap.set(event.sku, clean)
      }
      const asin = typeof event.raw?.['asin'] === 'string' ? event.raw['asin'].trim() : undefined
      if (asin && !asinTitleMap.has(asin)) {
        asinTitleMap.set(asin, clean)
      }
    }

    if (isCustomerSale(event)) {
      if (event.orderId) {
        orderSalesRecorded.set(event.orderId, (orderSalesRecorded.get(event.orderId) ?? 0) + event.amount)
        if (event.fulfillmentType) {
          orderChannelRecorded.set(event.orderId, event.fulfillmentType)
        }
      }
      if (event.sku && event.amount > 0) {
        const qty = event.quantity && event.quantity > 0 ? event.quantity : 1
        const stat = skuPriceMap.get(event.sku) ?? { total: 0, count: 0 }
        stat.total += event.amount / qty
        stat.count += 1
        skuPriceMap.set(event.sku, stat)
      }
    }
  }

  for (const order of input.sourceOrders ?? []) {
    if (order.fulfillmentType && !orderChannelRecorded.has(order.orderId)) {
      orderChannelRecorded.set(order.orderId, order.fulfillmentType)
    }
    const val = typeof order.orderValue === 'number' ? order.orderValue : Number(order.orderValue)
    if (Number.isFinite(val) && val > 0 && !orderSalesRecorded.has(order.orderId)) {
      orderSalesRecorded.set(order.orderId, val)
    }
    // Learn real SKU prices from confirmed orders even before settlement ledger arrives
    if (order.status?.toLowerCase() !== 'canceled') {
      if (order.sku && Number.isFinite(val) && val > 0) {
        const stat = skuPriceMap.get(order.sku) ?? { total: 0, count: 0 }
        stat.total += val
        stat.count += 1
        skuPriceMap.set(order.sku, stat)
      }
      for (const item of order.items ?? []) {
        const p = Number(item.price)
        if (item.sku && Number.isFinite(p) && p > 0) {
          const stat = skuPriceMap.get(item.sku) ?? { total: 0, count: 0 }
          stat.total += p
          stat.count += 1
          skuPriceMap.set(item.sku, stat)
        }
      }
    }
    if (order.title && !orderTitleMap.has(order.orderId)) {
      orderTitleMap.set(order.orderId, order.title)
    }
    if (order.imageUrl && !orderImageMap.has(order.orderId)) {
      orderImageMap.set(order.orderId, order.imageUrl)
    }
    if (order.sku) {
      if (skuTitleMap.has(order.sku) && !orderTitleMap.has(order.orderId)) {
        orderTitleMap.set(order.orderId, skuTitleMap.get(order.sku)!)
      }
      if (skuImageMap.has(order.sku) && !orderImageMap.has(order.orderId)) {
        orderImageMap.set(order.orderId, skuImageMap.get(order.sku)!)
      }
    }
  }

  for (const [oid, sales] of orderSalesRecorded) {
    const ch = (orderChannelRecorded.get(oid) || '').toUpperCase()
    if (ch === 'AFN' || ch === 'FBA' || ch === 'AMAZON') {
      fbaRevenue += sales
      fbaOrderCount++
    } else {
      fbmRevenue += sales
      fbmOrderCount++
    }
  }

  const lifecycle = indexOrderHistory(input.events, (input.sourceOrders ?? []).map(order=>({orderId:order.orderId,purchaseDate:order.purchaseDate,status:order.status??null,fulfillmentType:order.fulfillmentType??null,orderValue:order.orderValue==null?null:String(order.orderValue),currency:null})))
  function evaluate(label: string, from: string, to: string): PulsePeriodMetrics {
    const cohort = selectOrderCohort(lifecycle, { from, to }, 'ALL_RECORDED')
    const matchedEvents = cohort.events, orderIds = new Set(cohort.orders.filter(order=>order.events.length).map(order=>order.orderId))
    const overview = buildBusinessOverview(
      matchedEvents,
      input.costs,
      input.missingCostPolicy,
      input.normalizeSku,
      [...orderIds],
    )

    const periodOrders: PulseSourceOrder[] = []
    for (const [dateKey, orders] of ordersByDate) {
      if (dateKey >= from && dateKey <= to) {
        for (const order of orders) {
          periodOrders.push(order)
        }
      }
    }

    const totalOrderIds = new Set([...orderIds, ...periodOrders.map(o => o.orderId)])

    const cohortEvents=new Map(cohort.orders.map(order=>[order.orderId,order.events]))
    // Build classified order summaries for popup list
    const ordersMap = new Map<string, PulseOrderSummary>()
    const periodOrdersMap = new Map(periodOrders.map(o => [o.orderId, o]))
    const allSourceOrdersMap = new Map((input.sourceOrders ?? []).map(o => [o.orderId, o]))

    for (const orderId of totalOrderIds) {
      const sourceOrder = periodOrdersMap.get(orderId) ?? allSourceOrdersMap.get(orderId)
      const eventsForOrder = cohortEvents.get(orderId)??[]
      const isSettled = eventsForOrder.some(isCustomerSale)
      const orderSkus = [...new Set([
        ...eventsForOrder.flatMap(e => e.sku ? [e.sku] : []),
        ...(sourceOrder?.sku ? [sourceOrder.sku] : []),
      ])]
      const settledOrderSales = eventsForOrder.filter(isCustomerSale).reduce((s, e) => s + e.amount, 0)

      let orderValue = 0
      let isValueEstimated = false
      if (isSettled && settledOrderSales > 0) {
        orderValue = Math.round(settledOrderSales * 100) / 100
      } else if (sourceOrder?.orderValue !== undefined && sourceOrder?.orderValue !== null) {
        const parsed = typeof sourceOrder.orderValue === 'number' ? sourceOrder.orderValue : Number(sourceOrder.orderValue)
        orderValue = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0
      }

      // Check explicit item line prices
      if (orderValue === 0 && sourceOrder?.items?.length) {
        let itemsSum = 0
        for (const it of sourceOrder.items) {
          const p = Number(it.price)
          if (Number.isFinite(p) && p > 0) {
            itemsSum += p * (it.quantity || 1)
          }
        }
        if (itemsSum > 0) {
          orderValue = Math.round(itemsSum * 100) / 100
        }
      }

      // If order is pending/unsettled and Amazon did not provide orderValue (common for pending FBA orders)
      if (input.estimateMissingPrices && orderValue === 0 && !isSettled) {
        if (sourceOrder?.items?.length) {
          let verifiedPrice = 0
          let resolvedAll = true
          for (const it of sourceOrder.items) {
            const stat = it.sku ? skuPriceMap.get(it.sku) : null
            if (stat && stat.count > 0) {
              verifiedPrice += Math.round((stat.total / stat.count) * 100) / 100 * (it.quantity || 1)
            } else {
              resolvedAll = false
            }
          }
          if (verifiedPrice > 0 && resolvedAll) {
            orderValue = Math.round(verifiedPrice * 100) / 100
            isValueEstimated = true
          }
        }

        if (orderValue === 0) {
          for (const sku of orderSkus) {
            const stat = skuPriceMap.get(sku)
            if (stat && stat.count > 0) {
              orderValue = Math.round((stat.total / stat.count) * 100) / 100
              isValueEstimated = true
              break
            }
          }
        }
        // Strict financial truth: zero arbitrary guessing (no hardcoded fallback)
      }

      const purchaseDate = sourceOrder?.purchaseDate
        ?? eventsForOrder.find(e => e.orderPurchaseDate)?.orderPurchaseDate
        ?? cohort.orders.find(order=>order.orderId===orderId)?.saleDate
        ?? from

      const raw = (sourceOrder?.status ?? (isSettled ? 'Shipped' : 'Pending')).trim()
      const lower = raw.toLowerCase()
      let statusCategory: PulseOrderStatusCategory
      if (lower === 'canceled') {
        statusCategory = 'CANCELED'
      } else if (lower === 'pending') {
        statusCategory = 'PENDING'
      } else if (lower === 'unshipped' || lower === 'partiallyshipped' || lower === 'invoiceunconfirmed') {
        statusCategory = 'UNSHIPPED'
      } else if (lower === 'shipped' || lower === 'delivered' || isSettled) {
        statusCategory = 'CONFIRMED'
      } else {
        statusCategory = isSettled ? 'CONFIRMED' : 'UNSHIPPED'
      }

      const orderAsins = [...new Set(eventsForOrder.map(e => typeof e.raw?.['asin'] === 'string' ? e.raw['asin'].trim() : '').filter(Boolean))]

      const productTitle = orderTitleMap.get(orderId)
        ?? (sourceOrder as { title?: string | null })?.title
        ?? orderSkus.map(s => skuTitleMap.get(s)).find(Boolean)
        ?? orderAsins.map(a => asinTitleMap.get(a)).find(Boolean)
        ?? null

      const imageUrl = orderImageMap.get(orderId)
        ?? (sourceOrder as { imageUrl?: string | null })?.imageUrl
        ?? orderSkus.map(s => skuImageMap.get(s)).find(Boolean)
        ?? orderAsins.map(a => asinImageMap.get(a)).find(Boolean)
        ?? null

      ordersMap.set(orderId, {
        orderId,
        purchaseDate,
        rawStatus: raw,
        statusCategory,
        orderValue,
        isValueEstimated,
        isSettled,
        skus: orderSkus.length ? orderSkus : sourceOrder?.sku ? [sourceOrder.sku] : [],
        productTitle,
        imageUrl,
        fulfillmentType: sourceOrder?.fulfillmentType ?? eventsForOrder.find(e => e.fulfillmentType)?.fulfillmentType ?? null,
      })
    }

    const orderList = [...ordersMap.values()].sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate) || b.orderValue - a.orderValue)
    const confirmedOrdersCount = orderList.filter(o => o.statusCategory === 'CONFIRMED').length
    const unshippedOrdersCount = orderList.filter(o => o.statusCategory === 'UNSHIPPED').length
    const pendingOrdersCount = orderList.filter(o => o.statusCategory === 'PENDING').length

    // Calculate pending sales: only active unsettled orders (UNSHIPPED or PENDING), strictly excluding CANCELED
    const pendingSales = Math.round(
      orderList
        .filter(o => !o.isSettled && o.statusCategory !== 'CANCELED')
        .reduce((sum, o) => sum + (o.orderValue > 0 ? o.orderValue : 0), 0) * 100,
    ) / 100

    const customerSalesTax = input.includeCustomerTax === false ? matchedEvents.filter(e=>e.amountType==='TAX' && isCustomerSale(e)).reduce((sum,e)=>sum+e.amount,0) : 0
    const customerRefundTax = input.includeCustomerTax === false ? -matchedEvents.filter(e=>e.amountType==='TAX' && isCustomerRefund(e)).reduce((sum,e)=>sum+e.amount,0) : 0
    const grossSales = Math.round((overview.summary.grossSales-customerSalesTax)*100)/100
    const refunds = overview.summary.refundValue-customerRefundTax
    const netEarnings = Math.round((grossSales-refunds-overview.summary.marketplaceCharges-overview.summary.netEasyShipFee+overview.summary.reimbursements)*100)/100
    const estimatedPendingSales = Math.round(orderList.filter(o=>o.isValueEstimated && !o.isSettled && o.statusCategory!=='CANCELED').reduce((sum,o)=>sum+o.orderValue,0)*100)/100
    const financialRows = [
      {label:'Gross sales',value:grossSales},{label:'Customer refunds',value:-refunds},
      {label:'Marketplace fees (after credits)',value:-overview.summary.marketplaceCharges},
      {label:'Shipping fees (after credits)',value:-overview.summary.netEasyShipFee},
      {label:'Reimbursements',value:overview.summary.reimbursements},
    ]
    const totalSales = Math.round((grossSales + pendingSales) * 100) / 100
    const netProfit = Math.round((overview.profitAfterAds-customerSalesTax+customerRefundTax)*100)/100
    const profitMargin = grossSales > 0 ? (netProfit / grossSales) * 100 : 0
    const unitsSold = overview.summary.soldQuantity
    const returnUnits = overview.summary.returnQuantity
    const ordersCount = confirmedOrdersCount + unshippedOrdersCount + pendingOrdersCount

    let isPartialCoverage = false
    if (input.purchaseCoverage && input.purchaseCoverage.length) {
      const fromIso = indiaDateToUtcIso(from)
      const toIso = indiaDateToUtcIso(to, true)
      isPartialCoverage = missingRanges({ from: fromIso, to: toIso }, input.purchaseCoverage).length > 0
    }

    return {
      label,
      from,
      to,
      grossSales, netEarnings, estimatedPendingSales, financialRows, profitRows:[{label:'Net earnings',value:netEarnings},{label:'Product costs',value:overview.costStatus.profitReady?-overview.costStatus.netCogs:null},{label:'Booked advertising',value:-overview.summary.adsSpend},{label:'Other operating adjustments',value:Math.round((netProfit-netEarnings+overview.costStatus.netCogs+overview.summary.adsSpend)*100)/100}], profitReady:overview.costStatus.profitReady, awaitingFinancialOrders:orderList.filter(o=>!o.isSettled&&o.statusCategory!=='CANCELED').length, missingPriceOrders:orderList.filter(o=>!o.isSettled&&o.statusCategory!=='CANCELED'&&o.orderValue===0).length, excludedOrderRecords:cohort.missingSale.length + (cohort.outsidePeriod?.length ?? 0),
      pendingSales,
      totalSales,
      netProfit,
      profitMargin: Math.round(profitMargin * 10) / 10,
      ordersCount,
      pendingOrdersCount,
      confirmedOrdersCount,
      unshippedOrdersCount,
      unitsSold,
      returnUnits,
      orders: orderList,
      isPartialCoverage,
    }
  }

  const today = evaluate('Today (so far)', anchorDate, anchorDate)
  const yesterday = evaluate('Yesterday', yesterdayDate, yesterdayDate)
  const thisMonth = evaluate('This Month', monthStart, anchorDate)

  const [year, month, day] = anchorDate.split('-').map(Number)
  const elapsedDays = Math.max(1, day)
  const daysInMonth = new Date(year, month, 0).getDate()
  const multiplier = daysInMonth / elapsedDays

  const monthTotalSales = thisMonth.grossSales
  const forecastSales = Math.round(monthTotalSales * multiplier)
  const forecastProfit = Math.round(thisMonth.netProfit * multiplier)
  const forecastOrders = Math.round(thisMonth.ordersCount * multiplier)
  const forecastUnits = Math.round(thisMonth.unitsSold * multiplier)
  const forecastMargin = forecastSales > 0 ? (forecastProfit / forecastSales) * 100 : 0

  const forecast: PulsePeriodMetrics = {
    label: 'Month Forecast',
    from: monthStart,
    to: `${anchorDate.slice(0, 7)}-${String(daysInMonth).padStart(2, '0')}`,
    missingPriceOrders:0,awaitingFinancialOrders:0,
    profitRows:thisMonth.profitRows.map(row=>({...row,value:row.value===null?null:Math.round(row.value*multiplier)})),
    grossSales: forecastSales, netEarnings:Math.round(thisMonth.netEarnings*multiplier), estimatedPendingSales:0, financialRows:thisMonth.financialRows.map(row=>({...row,value:Math.round(row.value*multiplier)})), profitReady:thisMonth.profitReady, excludedOrderRecords:thisMonth.excludedOrderRecords,
    pendingSales: 0,
    totalSales: forecastSales,
    netProfit: forecastProfit,
    profitMargin: Math.round(forecastMargin * 10) / 10,
    ordersCount: forecastOrders,
    pendingOrdersCount: 0,
    confirmedOrdersCount: forecastOrders,
    unshippedOrdersCount: 0,
    unitsSold: forecastUnits,
    returnUnits: Math.round(thisMonth.returnUnits * multiplier),
    orders: [],
  }

  return {
    today,
    yesterday,
    thisMonth,
    forecast,
    anchorDate,
  }
}
