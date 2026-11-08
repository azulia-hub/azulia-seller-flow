import type { CanonicalFinancialEvent } from '../data/types'
import type { ProductCost } from '../costs/types'
import type { MissingCostPolicy } from '../costs/calculateCosts'
import { canonicalDateKey } from './dashboardSummary'
import { buildBusinessOverview } from './businessOverview'

export interface PulsePeriodMetrics {
  readonly label: string
  readonly from: string
  readonly to: string
  readonly grossSales: number
  readonly pendingSales: number
  readonly netProfit: number
  readonly profitMargin: number
  readonly ordersCount: number
  readonly pendingOrdersCount: number
  readonly unitsSold: number
  readonly returnUnits: number
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

  const orderDates = new Map<string, string>()
  const ordersByDate = new Map<string, PulseSourceOrder[]>()
  for (const order of input.sourceOrders ?? []) {
    if (!order.orderId || !order.purchaseDate) continue
    const dateKey = order.purchaseDate.slice(0, 10)
    orderDates.set(order.orderId, dateKey)
    const list = ordersByDate.get(dateKey) ?? []
    list.push(order)
    ordersByDate.set(dateKey, list)
  }

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
    const pendingOrders = periodOrders.filter(o => !orderIds.has(o.orderId))
    const pendingOrdersCount = pendingOrders.length
    const pendingSales = Math.round(
      pendingOrders.reduce((sum, o) => {
        const val = typeof o.orderValue === 'number' ? o.orderValue : Number(o.orderValue)
        return Number.isFinite(val) && val > 0 ? sum + val : sum
      }, 0) * 100,
    ) / 100

    const grossSales = overview.summary.grossSales
    const netProfit = overview.profitAfterAds
    const profitMargin = grossSales > 0 ? (netProfit / grossSales) * 100 : 0
    const unitsSold = overview.summary.soldQuantity
    const returnUnits = overview.summary.returnQuantity
    const ordersCount = totalOrderIds.size

    return {
      label,
      from,
      to,
      grossSales,
      pendingSales,
      netProfit,
      profitMargin: Math.round(profitMargin * 10) / 10,
      ordersCount,
      pendingOrdersCount,
      unitsSold,
      returnUnits,
    }
  }

  const today = evaluate('Today (so far)', anchorDate, anchorDate)
  const yesterday = evaluate('Yesterday', yesterdayDate, yesterdayDate)
  const thisMonth = evaluate('This Month', monthStart, anchorDate)

  const [year, month, day] = anchorDate.split('-').map(Number)
  const elapsedDays = Math.max(1, day)
  const daysInMonth = new Date(year, month, 0).getDate()
  const multiplier = daysInMonth / elapsedDays

  const monthTotalSales = thisMonth.grossSales + thisMonth.pendingSales
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
    netProfit: forecastProfit,
    profitMargin: Math.round(forecastMargin * 10) / 10,
    ordersCount: forecastOrders,
    pendingOrdersCount: 0,
    unitsSold: forecastUnits,
    returnUnits: Math.round(thisMonth.returnUnits * multiplier),
  }

  return {
    today,
    yesterday,
    thisMonth,
    forecast,
    anchorDate,
  }
}
