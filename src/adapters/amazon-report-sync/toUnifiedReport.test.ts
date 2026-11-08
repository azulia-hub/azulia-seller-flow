import { expect, it } from 'vitest'
import type { CanonicalFinancialEvent } from '../../core/data/types'
import { toUnifiedReport } from './toUnifiedReport'
import { parseSourceJson } from './money'
const money = (amount: string) => ({ currencyAmount: amount, currencyCode: 'INR' })
const part = (name: string, amount: string, breakdowns: unknown[] = []) => ({ breakdownType: name, breakdownAmount: money(amount), breakdowns })
const item = (sku: string, amount: string, breakdowns: unknown[]) => ({ totalAmount: money(amount), contexts: [{ contextType: 'ProductContext', sku, quantityShipped: 1, fulfillmentNetwork: 'MFN' }], breakdowns })
const record = { transactionId: 'tx', postedDate: '2026-11-01T20:00:00Z', transactionStatus: 'RELEASED', transactionType: 'Shipment', totalAmount: money('90.00'), relatedIdentifiers: [{ relatedIdentifierName: 'ORDER_ID', relatedIdentifierValue: 'order' }], items: [item('SKU', '90.00', [part('ProductCharges', '100.00'), part('Commission', '-10.00')])], breakdowns: [part('ProductCharges', '100.00'), part('Commission', '-10.00')] }
const snapshot = (records: Record<string, unknown>[]) => ({ connectionKey: 'account', revision: 1, updatedAt: null, records, coverage: [] })
it('uses the existing normalizer without adding the transaction and item trees twice', () => {
  const result = toUnifiedReport(snapshot([record]))
  expect(result.dataset.quality.reconciliation).toMatchObject({ sourceTotal: 90, normalizedTotal: 90, difference: 0, reconciled: true })
  expect(result.dataset.events.filter(row => row.amountType === 'PRODUCT_REVENUE').map(row => row.amount)).toEqual([100])
  expect(result.raw.rows[0]['date/time']).toBe('2026-11-02T01:30:00.000+05:30')
})
it('preserves unclassified differences as unknown money and does not assign them to a SKU', () => {
  const result = toUnifiedReport(snapshot([{ ...record, totalAmount: money('87.00') }]))
  expect(result.dataset.quality.reconciliation.reconciled).toBe(true)
  expect(result.dataset.events.find(row => row.amountType === 'UNKNOWN')).toMatchObject({ amount: -3, sku: null, classified: false })
})
it('keeps Easy Ship and advertising components separate under the old column mapping', () => {
  const result = toUnifiedReport(snapshot([{ ...record, totalAmount: money('-15.00'), transactionType: 'ServiceFee', items: [item('SKU', '-15.00', [part('EasyShipFee', '-10.00'), part('AdvertisingFee', '-5.00')])] }]))
  expect(result.dataset.events.map(row => row.amountType)).toEqual(['SHIPPING_FEE', 'ADVERTISING_FEE'])
})
it('replaces explicitly linked deferred versions without inventing a second sale', () => {
  const pending = { ...record, transactionId: 'pending', transactionStatus: 'DEFERRED' }
  const released = { ...record, relatedIdentifiers: [...record.relatedIdentifiers, { relatedIdentifierName: 'DEFERRED_TRANSACTION_ID', relatedIdentifierValue: 'pending' }] }
  expect(toUnifiedReport(snapshot([pending, released])).dataset.events.filter(row => row.amountType === 'PRODUCT_REVENUE')).toHaveLength(1)
})
it('retains unknown transaction kinds and parses decimal lexemes without changing quantities', () => {
  expect(toUnifiedReport(snapshot([{ ...record, transactionType: 'FutureEvent' }])).dataset.quality.unclassifiedEventCount).toBeGreaterThan(0)
  expect(parseSourceJson('{"currencyAmount":0.10,"quantityShipped":2}')).toEqual({ currencyAmount: '0.10', quantityShipped: 2 })
})
it('rejects unsupported currencies instead of silently adding them to INR', () => {
  expect(() => toUnifiedReport(snapshot([{ ...record, totalAmount: { currencyAmount: '90', currencyCode: 'USD' } }]))).toThrow('USD')
})

it('keeps event identities stable when an older transaction is backfilled', () => {
  const initial = toUnifiedReport(snapshot([record])).dataset.events.filter(event => event.raw['api transaction id'] === 'tx').map(event => event.id)
  const older = { ...record, transactionId: 'older', postedDate: '2026-10-01T00:00:00Z' }
  expect(toUnifiedReport(snapshot([older, record])).dataset.events.filter(event => event.raw['api transaction id'] === 'tx').map(event => event.id)).toEqual(initial)
})

it('emits item quantity once across multiple product revenue components', () => {
  const result = toUnifiedReport(snapshot([{ ...record, totalAmount: money('100.00'), items: [item('SKU', '100.00', [part('ProductCharges', '60.00'), part('ProductRevenue', '40.00')])] }]))
  expect(result.dataset.events.filter(event => event.amountType === 'PRODUCT_REVENUE').reduce((sum, event) => sum + (event.quantity ?? 0), 0)).toBe(1)
})

it('treats a same-ID deferred-to-released update as one released source record', () => {
  const result = toUnifiedReport(snapshot([{ ...record, transactionStatus: 'DEFERRED_RELEASED' }]))
  expect(result.dataset.events.filter(event => event.amountType === 'PRODUCT_REVENUE')).toHaveLength(1)
  expect(result.dataset.events.find(event => event.amountType === 'PRODUCT_REVENUE')?.status).toBe('Released')
})

it('accepts an empty currencyless zero child under a validated INR zero transaction', () => {
  const empty = { ...record, transactionId: 'zero-placeholder', totalAmount: money('0.0'), items: [{ totalAmount: { currencyAmount: '0.0', currencyCode: null }, breakdowns: [] }], breakdowns: [] }
  const result = toUnifiedReport(snapshot([record, empty]))
  expect(result.dataset.quality.reconciliation).toMatchObject({ sourceTotal: 90, normalizedTotal: 90, reconciled: true })
  expect(result.dataset.events.filter(event => event.amountType === 'PRODUCT_REVENUE')).toHaveLength(1)
})
it('still rejects missing currencies on nonzero children and explicit foreign-currency zeros', () => {
  const missing = { ...record, items: [{ totalAmount: { currencyAmount: '90.00', currencyCode: null }, breakdowns: [] }] }
  const foreignZero = { ...record, totalAmount: money('0.00'), items: [{ totalAmount: { currencyAmount: '0.00', currencyCode: 'USD' }, breakdowns: [] }] }
  expect(() => toUnifiedReport(snapshot([missing]))).toThrow('missing or invalid')
  expect(() => toUnifiedReport(snapshot([foreignZero]))).toThrow('USD')
})

it('maps observed India sales/tax/fee labels through the original normalizer and conserves their total', () => {
  const breakdowns = [part('ProductCharges', '100.00', [part('OurPricePrincipal', '100.00')]), part('Tax', '18.00', [part('OurPriceTax', '18.00')]), part('TaxCollectedAtSource', '-1.00', [part('TCS-IGST', '-1.00')]), part('TaxWithholding', '-2.00', [part('ItemTDS', '-2.00')]), part('AmazonFees', '-11.80', [part('Commission', '-11.80', [part('Base', '-10.00'), part('Tax', '-1.80')])])]
  const result = toUnifiedReport(snapshot([{ ...record, totalAmount: money('103.20'), items: [item('SKU', '103.20', breakdowns)], breakdowns }]))
  expect(result.dataset.quality.reconciliation).toMatchObject({ sourceTotal: 103.2, normalizedTotal: 103.2, reconciled: true })
  expect(result.dataset.events.find(event => event.amountType === 'PRODUCT_REVENUE')).toMatchObject({ amount: 100, quantity: 1, sku: 'SKU', event: 'SALE' })
  expect(result.dataset.events.filter(event => event.amountType === 'COMMISSION').reduce((total, event) => total + event.amount, 0)).toBeCloseTo(-11.8)
  expect(result.dataset.quality.unclassifiedEventCount).toBe(0)
})
it('separates explicitly named reimbursements from their recorded expenses', () => {
  const result = toUnifiedReport(snapshot([{ ...record, transactionType: 'Adjustment', totalAmount: money('95.00'), items: [], breakdowns: [part('Sales', '100.00', [part('SAFETReimbursement', '100.00')]), part('Expenses', '-5.00')] }]))
  expect(result.dataset.quality.reconciliation.reconciled).toBe(true)
  expect(result.dataset.events.find(event => event.event === 'REIMBURSEMENT')).toMatchObject({ amount: 100 })
  expect(result.dataset.events.find(event => event.amountType === 'OTHER_FEE')).toMatchObject({ amount: -5, event: 'FEE' })
})

it('keeps API posting dates for audit but assigns all order activity to a verified India purchase date', async () => {
  const { buildOrderCohort } = await import('../../core/analytics/orderLifecycle')
  const released = { ...record, azuliaOrderPurchaseDate: '2026-10-31T18:00:00Z' }
  const refund = { ...released, transactionId: 'refund', postedDate: '2026-12-01T00:00:00Z', transactionType: 'Refund', transactionStatus: 'DEFERRED', totalAmount: money('-100.00'), items: [item('SKU', '-100.00', [part('ProductCharges', '-100.00')])] }
  const result = toUnifiedReport(snapshot([released, refund]))
  expect(result.dataset.quality.reconciliation.reconciled).toBe(true)
  expect(result.dataset.events[0]).toMatchObject({ date: '2026-11-02T01:30:00.000+05:30', orderPurchaseDate: '2026-10-31', releaseState: 'RELEASED' })
  const october = buildOrderCohort(result.dataset.events, { from: '2026-10-01', to: '2026-10-31' })
  expect(october.events.filter(event => event.amountType === 'PRODUCT_REVENUE').map(event => event.amount)).toEqual([100])
  expect(october.pendingEvents.filter(event => event.amountType === 'PRODUCT_REVENUE').map(event => event.amount)).toEqual([-100])
  expect(buildOrderCohort(result.dataset.events, { from: '2026-11-01', to: '2026-12-31' }).observedEvents).toEqual([])
})
it('does not use a release posting date when the order purchase date is unavailable', async () => {
  const { buildOrderCohort } = await import('../../core/analytics/orderLifecycle')
  const result = toUnifiedReport(snapshot([record]))
  const cohort = buildOrderCohort(result.dataset.events, { from: '2026-11-01', to: '2026-11-30' })
  expect(cohort.events).toEqual([])
  expect(cohort.missingSale).toHaveLength(1)
  expect(result.dataset.quality.reconciliation.reconciled).toBe(true)
  expect(result.issues.some(issue => issue.includes('verified purchase date'))).toBe(true)
})

it('matches CSV sale, closing charges, postage, later refund and Easy Ship reversal through the same cohort engine', async () => {
  const { amazonUnifiedTransactionAdapter } = await import('../amazon/unifiedTransactionAdapter')
  const { buildOrderCohort, buildCohortFinancials } = await import('../../core/analytics/orderLifecycle')
  const purchase = '2026-10-02T00:00:00Z'
  const fees = [part('Commission', '-118.00', [part('Base', '-100.00'), part('Tax', '-18.00')]), part('FixedClosingFee', '-59.00', [part('Base', '-50.00'), part('Tax', '-9.00')])]
  const saleParts = [part('ProductCharges', '1000.00', [part('OurPricePrincipal', '1000.00')]), part('Tax', '180.00', [part('OurPriceTax', '180.00')]), part('AmazonFees', '-177.00', fees)]
  const sale = { ...record, azuliaOrderPurchaseDate: purchase, totalAmount: money('1003.00'), items: [item('SKU', '1003.00', saleParts)] }
  const postage = { ...record, transactionId: 'postage', transactionType: 'ServiceFee', azuliaOrderPurchaseDate: purchase, description: 'MfnPostageFee', totalAmount: money('-118.00'), items: [item('SKU', '-118.00', [part('AmazonFees', '-118.00', [part('MFNPostageFee', '-118.00', [part('Base', '-100.00'), part('Tax', '-18.00')])])])] }
  const refundParts = [part('ProductCharges', '-1000.00', [part('OurPricePrincipal', '-1000.00')]), part('Tax', '-180.00', [part('OurPriceTax', '-180.00')]), part('AmazonFees', '177.00', [part('Commission', '118.00'), part('FixedClosingFee', '59.00')])]
  const refund = { ...sale, transactionId: 'refund', transactionType: 'Refund', postedDate: '2026-12-01T00:00:00Z', totalAmount: money('-1003.00'), items: [item('SKU', '-1003.00', refundParts)] }
  const reversal = { ...postage, transactionId: 'reversal', postedDate: '2026-12-01T00:00:00Z', description: 'EasyshipFulfillmentFeeRefund', totalAmount: money('118.00'), items: [], breakdowns: [part('Sales', '118.00', [part('AmazonFees', '118.00')])] }
  const base = { 'order id': 'order', sku: 'SKU', quantity: 1, 'Transaction Status': 'Released' }
  const csvRows = [{ ...base, 'date/time': '2026-10-02', type: 'Order', 'product sales': '1000', 'Total sales tax liable(GST before adjusting TCS)': '180', 'selling fees': '-118', 'other transaction fees': '-59', total: '1003', description: 'Product' }, { ...base, quantity: 0, 'date/time': '2026-10-02', type: 'Shipping Services', 'other transaction fees': '-118', total: '-118', description: 'Easy Ship weight handling fees' }, { ...base, 'date/time': '2026-12-01', type: 'Refund', 'product sales': '-1000', 'Total sales tax liable(GST before adjusting TCS)': '-180', 'selling fees': '118', 'other transaction fees': '59', total: '-1003', description: 'Product' }, { ...base, quantity: 0, 'date/time': '2026-12-01', type: 'Shipping Services', 'other transaction fees': '118', total: '118', description: 'Amazon Easy Ship Weight Handling Fee Reversal' }]
  const range = { from: '2026-10-01', to: '2026-10-31' }
  for (const size of [2, 4]) {
    const rows = csvRows.slice(0, size)
    const csv = amazonUnifiedTransactionAdapter.normalize({ id: 'reference', name: 'reference', rows, headers: [...new Set(rows.flatMap(row => Object.keys(row)))] })
    const api = toUnifiedReport(snapshot([sale, postage, refund, reversal].slice(0, size))).dataset
    const summary = (events: readonly CanonicalFinancialEvent[]) => buildCohortFinancials(buildOrderCohort(events, range), [{ sku: 'SKU', unitCost: 100, updatedAt: '' }], 'BLOCK').released
    expect(summary(api.events)).toEqual(summary(csv.events))
    expect(api.quality.reconciliation.reconciled).toBe(true)
  }
  const result = toUnifiedReport(snapshot([sale, postage, refund, reversal]))
  expect(result.dataset.events.find(event => event.event === 'REFUND')?.returnType).toBe('RTO')
})
it('recognizes labelled standalone account TDS totals while preserving unknown tax items', () => {
  const tds = { ...record, transactionId: 'tds', transactionType: 'TaxWithholding', description: 'TaxWithholding', relatedIdentifiers: [], totalAmount: money('-10.00'), items: [{ description: 'TDS-Section-194-O', totalAmount: money('-10.00'), breakdowns: null }] }
  const result = toUnifiedReport(snapshot([tds]))
  expect(result.dataset.events).toHaveLength(1)
  expect(result.dataset.events[0]).toMatchObject({ amount: -10, event: 'TAX', amountType: 'TAX', orderId: null })
  expect(result.dataset.quality.reconciliation.reconciled).toBe(true)
  const unknown = toUnifiedReport(snapshot([{ ...tds, items: [{ ...tds.items[0], description: 'FutureTax' }] }]))
  expect(unknown.dataset.events[0]).toMatchObject({ amount: -10, amountType: 'UNKNOWN', classified: false })
})
it('supplies real item titles and ASIN-specific images without presenting financial labels as product titles', () => {
  const source = { ...record, items: [{ ...record.items[0], description: 'Oak shelf', contexts: [{ contextType: 'ProductContext', sku: 'SKU', asin: 'B012345678', quantityShipped: 1 }] }], azuliaCatalogImages: { B012345678: 'https://images.example.invalid/shelf.jpg' } }
  const result = toUnifiedReport(snapshot([source]))
  const sale = result.dataset.events.find(row => row.amountType === 'PRODUCT_REVENUE')!
  expect(sale.raw['product title']).toBe('Oak shelf')
  expect(sale.raw['product image']).toBe('https://images.example.invalid/shelf.jpg')
  expect(sale.descriptionIsProductTitle).toBe(false)
  expect(sale.sourceTransactionId).toBe('tx')
  expect(result.dataset.quality.reconciliation.reconciled).toBe(true)
})

it('delivers order-only metadata without converting its total to sales', () => {
  const result = toUnifiedReport({ ...snapshot([]), orders: [{ id: '111-1234567-1234567', purchased: '2026-10-31T20:00:00Z', status: 'Unshipped', fulfillmentType: 'MFN', orderValue: '1180.00', currency: 'INR' }] })
  expect(result.dataset.orders).toEqual([{ orderId: '111-1234567-1234567', purchaseDate: '2026-11-01', status: 'Unshipped', fulfillmentType: 'MFN', orderValue: '1180.00', currency: 'INR' }])
  expect(result.dataset.events).toEqual([])
})
it('uses Orders metadata to date new financial activity in the original purchase period', () => {
  const id = '111-1234567-1234567'
  const result = toUnifiedReport({ ...snapshot([{ ...record, transactionStatus: 'DEFERRED', relatedIdentifiers: [{ relatedIdentifierName: 'ORDER_ID', relatedIdentifierValue: id }] }]), orders: [{ id, purchased: '2026-10-15T00:00:00Z', status: 'Shipped', fulfillmentType: 'MFN', orderValue: null, currency: null }] })
  expect(result.dataset.events.every(event => event.orderPurchaseDate === '2026-10-15')).toBe(true)
  expect(result.dataset.events.some(event => event.amountType === 'PRODUCT_REVENUE' && event.amount === 100)).toBe(true)
})
it('replaces an explicitly linked released version even when its corrected financial total changed', () => {
  const pending = { ...record, transactionId: 'pending-change', transactionStatus: 'DEFERRED' }
  const released = { ...record, transactionId: 'released-change', totalAmount: money('80.00'), items: [item('SKU', '80.00', [part('ProductCharges', '100.00'), part('Commission', '-20.00')])], relatedIdentifiers: [...record.relatedIdentifiers, { relatedIdentifierName: 'DEFERRED_TRANSACTION_ID', relatedIdentifierValue: 'pending-change' }] }
  const result = toUnifiedReport(snapshot([pending, released]))
  expect(result.dataset.events.filter(event => event.amountType === 'PRODUCT_REVENUE')).toHaveLength(1)
  expect(result.dataset.quality.reconciliation).toMatchObject({ normalizedTotal: 80, reconciled: true })
  expect(result.raw.rows.every(row => row['api transaction id'] === 'released-change')).toBe(true)
})
