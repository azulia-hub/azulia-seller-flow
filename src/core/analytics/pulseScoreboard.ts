import type { CanonicalFinancialEvent } from '../data/types'
import type { ProductCost } from '../costs/types'
import type { MissingCostPolicy } from '../costs/calculateCosts'
import { canonicalDateKey, isCustomerSale } from './dashboardSummary'
import { buildBusinessOverview } from './businessOverview'
import { productImage, productTitles } from '../search/productTitles'

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
}

export interface PulseScoreboardInput {
  readonly events: readonly CanonicalFinancialEvent[]
  readonly costs: readonly ProductCost[]
  readonly missingCostPolicy: MissingCostPolicy
  readonly normalizeSku?: (sku: string) => string
  readonly sourceOrders?: readonly PulseSourceOrder[]
  readonly anchorDate?: string
}

function filterEventsByDateRange(
  events: readonly CanonicalFinancialEvent[],
  from: string,
  to: string,
  orderDates: Map<string, string>,
): { matchedEvents: CanonicalFinancialEvent[]; orderIds: Set<string> } {
  const matchedEvents: CanonicalFinancialEvent[] = []
  const orderIds = new Set<string>()

  for (const event of events) {
    const orderDate = event.orderId ? orderDates.get(event.orderId) : undefined
    const effectiveDate = orderDate ?? canonicalDateKey(event.orderPurchaseDate ?? null) ?? canonicalDateKey(event.date)
    if (effectiveDate && effectiveDate >= from && effectiveDate <= to) {
      matchedEvents.push(event)
      if (event.orderId) orderIds.add(event.orderId)
    }
  }

  return { matchedEvents, orderIds }
}

export function computePulseScoreboard(input: PulseScoreboardInput): PulseScoreboard {
  const anchorDate = input.anchorDate ?? new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
  const yesterdayDate = new Date(Date.parse(anchorDate) - 86400000).toISOString().slice(0, 10)
  const monthStart = `${anchorDate.slice(0, 7)}-01`

  // Precompute product titles, images, SKU prices, and fulfillment channel AOVs
  const orderTitleMap = new Map<string, string>()
  const skuTitleMap = new Map<string, string>()
  const asinTitleMap = new Map<string, string>()
  const orderImageMap = new Map<string, string>()
  const skuImageMap = new Map<string, string>()
  const asinImageMap = new Map<string, string>()
  const skuPriceMap = new Map<string, { total: number; count: number }>()

  const orderDates = new Map<string, string>()
  const ordersByDate = new Map<string, PulseSourceOrder[]>()
  for (const order of input.sourceOrders ?? []) {
    if (!order.orderId || !order.purchaseDate) continue
    const dateKey = order.purchaseDate.slice(0, 10)
    orderDates.set(order.orderId, dateKey)
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

  const defaultFbaAov = fbaOrderCount > 0 ? Math.round((fbaRevenue / fbaOrderCount) * 100) / 100 : 750
  const defaultFbmAov = fbmOrderCount > 0 ? Math.round((fbmRevenue / fbmOrderCount) * 100) / 100 : 650

  function evaluate(label: string, from: string, to: string): PulsePeriodMetrics {
    const { matchedEvents, orderIds } = filterEventsByDateRange(input.events, from, to, orderDates)
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
          if (order.status?.toLowerCase() !== 'canceled') {
            periodOrders.push(order)
          }
        }
      }
    }

    const totalOrderIds = new Set([...orderIds, ...periodOrders.map(o => o.orderId)])

    // Build classified order summaries for popup list
    const ordersMap = new Map<string, PulseOrderSummary>()
    const periodOrdersMap = new Map(periodOrders.map(o => [o.orderId, o]))
    const allSourceOrdersMap = new Map((input.sourceOrders ?? []).map(o => [o.orderId, o]))

    for (const orderId of totalOrderIds) {
      const sourceOrder = periodOrdersMap.get(orderId) ?? allSourceOrdersMap.get(orderId)
      const eventsForOrder = matchedEvents.filter(e => e.orderId === orderId)
      const isSettled = eventsForOrder.length > 0
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

      // If order is pending/unsettled and Amazon did not provide orderValue (common for pending FBA orders)
      if (orderValue === 0 && !isSettled) {
        const ft = (sourceOrder?.fulfillmentType || eventsForOrder.find(e => e.fulfillmentType)?.fulfillmentType || '').toUpperCase()
        const isFba = ft === 'AFN' || ft === 'FBA' || ft === 'AMAZON'

        let skuEstimatedPrice: number | null = null
        for (const sku of orderSkus) {
          const stat = skuPriceMap.get(sku)
          if (stat && stat.count > 0) {
            skuEstimatedPrice = Math.round((stat.total / stat.count) * 100) / 100
            break
          }
        }
        orderValue = skuEstimatedPrice ?? (isFba ? defaultFbaAov : defaultFbmAov)
        isValueEstimated = true
      }

      const purchaseDate = sourceOrder?.purchaseDate
        ?? eventsForOrder.find(e => e.orderPurchaseDate)?.orderPurchaseDate
        ?? eventsForOrder[0]?.date
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
    const pendingOrdersCount = orderList.filter(o => !orderIds.has(o.orderId) && o.statusCategory !== 'CANCELED').length

    // Calculate pending sales including pending FBA orders
    const pendingSales = Math.round(
      orderList
        .filter(o => !orderIds.has(o.orderId) && o.statusCategory !== 'CANCELED')
        .reduce((sum, o) => sum + (o.orderValue > 0 ? o.orderValue : 0), 0) * 100,
    ) / 100

    const grossSales = overview.summary.grossSales
    const totalSales = Math.round((grossSales + pendingSales) * 100) / 100
    const netProfit = overview.profitAfterAds
    const profitMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0
    const unitsSold = overview.summary.soldQuantity
    const returnUnits = overview.summary.returnQuantity
    const ordersCount = totalOrderIds.size

    return {
      label,
      from,
      to,
      grossSales,
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
    }
  }

  const today = evaluate('Today (so far)', anchorDate, anchorDate)
  const yesterday = evaluate('Yesterday', yesterdayDate, yesterdayDate)
  const thisMonth = evaluate('This Month', monthStart, anchorDate)

  const [year, month, day] = anchorDate.split('-').map(Number)
  const elapsedDays = Math.max(1, day)
  const daysInMonth = new Date(year, month, 0).getDate()
  const multiplier = daysInMonth / elapsedDays

  const monthTotalSales = thisMonth.totalSales
  const forecastSales = Math.round(monthTotalSales * multiplier)
  const forecastProfit = Math.round(thisMonth.netProfit * multiplier)
  const forecastOrders = Math.round(thisMonth.ordersCount * multiplier)
  const forecastUnits = Math.round(thisMonth.unitsSold * multiplier)
  const forecastMargin = forecastSales > 0 ? (forecastProfit / forecastSales) * 100 : 0

  const forecast: PulsePeriodMetrics = {
    label: 'Month Forecast',
    from: monthStart,
    to: `${anchorDate.slice(0, 7)}-${String(daysInMonth).padStart(2, '0')}`,
    grossSales: forecastSales,
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
