import { describe, expect, it } from 'vitest'
import type { CanonicalFinancialEvent } from '../data/types'
import { buildReportSearchIndex, searchReport } from './reportSearch'
const event = (id: string, extra: Partial<CanonicalFinancialEvent> = {}): CanonicalFinancialEvent => ({
  id, source: 'generic', sourceDatasetId: 'report', sourceRow: 1, date: '2026-08-01', orderId: 'ORDER-1', sku: 'SKU-RED', event: 'SALE', quantity: 1, amount: 100,
  amountClass: 'OPERATING', amountType: 'PRODUCT_REVENUE', state: 'MH', city: 'Pune', status: null, rawType: 'Sale', rawDescription: 'Red shelf', classified: true, raw: {}, ...extra,
})
const events = [event('sale'), event('refund', { date: '2026-09-01', event: 'REFUND', amount: -100 }), event('unknown', { orderId: null, sku: null, rawDescription: 'Unfamiliar service adjustment', event: 'UNKNOWN', classified: false, amount: -20 })]

describe('report search', () => {
  it('finds product names, SKU aliases and exact order IDs case-insensitively', () => {
    const index = buildReportSearchIndex(events, { productAliases: [{ sku: 'SKU-RED', aliases: ['IDENTITY-123'] }] })
    expect(searchReport(index, 'red shelf').results[0]).toMatchObject({ kind: 'PRODUCT', sku: 'SKU-RED', eventIds: ['sale', 'refund'] })
    expect(searchReport(index, 'identity-123').results[0].sku).toBe('SKU-RED')
    expect(searchReport(index, 'order-1').results[0]).toMatchObject({ kind: 'ORDER', eventIds: ['sale', 'refund'] })
    const sourceAliases = buildReportSearchIndex(events, { normalizeSku: value => value.replace('-CHANNEL', ''), productAliases: [{ sku: 'SKU-RED-CHANNEL', aliases: ['IDENTITY-123'] }] })
    expect(searchReport(sourceAliases, 'sku-red-channel').results[0].sku).toBe('SKU-RED')
    expect(searchReport(index, 'red absent').total).toBe(0)
  })
  it('searches explicit title columns and sale descriptions with a title-only option', () => {
    const rows = [event('title', { rawDescription: 'Order sale', raw: { 'Product_Title': 'Oak floating wall shelf' } }), event('other', { sku: 'OAK-SKU', orderId: 'OAK-ORDER', rawDescription: 'Blue basket' })]
    const original = JSON.stringify(rows)
    const index = buildReportSearchIndex(rows)
    expect(searchReport(index, 'floating wall', 30, 'TITLE').results).toEqual([expect.objectContaining({ kind: 'PRODUCT', label: 'Oak floating wall shelf', sku: 'SKU-RED' })])
    expect(searchReport(index, 'OAK-SKU', 30, 'TITLE').total).toBe(0)
    expect(searchReport(index, 'blue basket', 30, 'TITLE').results[0].sku).toBe('OAK-SKU')
    expect(searchReport(index, 'floating').results.some(row => row.kind === 'ORDER')).toBe(true)
    expect(JSON.stringify(rows)).toBe(original)
    const custom = buildReportSearchIndex([event('custom', { raw: { 'Listing heading': 'Custom cabinet' } })], { productTitleFields: ['Listing heading'] })
    expect(searchReport(custom, 'custom cabinet', 30, 'TITLE').results[0].sku).toBe('SKU-RED')
  })
  it('preserves location, unknown and undated evidence without changing the input', () => {
    const snapshot = JSON.stringify(events)
    const index = buildReportSearchIndex([...events, event('undated', { orderId: 'OLD-ORDER', date: null })])
    expect(searchReport(index, 'pune').results.some(result => result.kind === 'LOCATION')).toBe(true)
    expect(searchReport(index, 'unfamiliar adjustment').results).toContainEqual(expect.objectContaining({ kind: 'TRANSACTION', eventIds: ['unknown'] }))
    expect(searchReport(index, 'old-order').results[0].eventIds).toEqual(['undated'])
    expect(JSON.stringify(events)).toBe(snapshot)
  })
  it('never assigns a product alias to ambiguous normalized SKU identities', () => {
    const index = buildReportSearchIndex([event('a', { sku: 'X' }), event('b', { sku: 'X-CHANNEL' })], {
      normalizeSku: value => value.replace('-CHANNEL', ''), productAliases: [{ sku: 'X', aliases: ['AMBIGUOUS-ID'] }],
    })
    expect(searchReport(index, 'ambiguous-id').total).toBe(0)
  })
  it('restricts each search mode to its own field and result kind', () => {
    const index = buildReportSearchIndex(events, { productAliases: [{ sku: 'SKU-RED', aliases: ['IDENTITY-123'] }] })
    expect(searchReport(index, 'sku-red', 30, 'SKU').results).toEqual([expect.objectContaining({ kind:'PRODUCT', sku:'SKU-RED' })])
    expect(searchReport(index, 'red shelf', 30, 'SKU').total).toBe(0)
    expect(searchReport(index, 'identity-123', 30, 'IDENTITY').results[0].sku).toBe('SKU-RED')
    expect(searchReport(index, 'sku-red', 30, 'IDENTITY').total).toBe(0)
    expect(searchReport(index, 'identity-123', 30, 'SKU').total).toBe(0)
    expect(searchReport(index, 'pune', 30, 'CITY').results).toEqual([expect.objectContaining({ kind:'LOCATION', label:'Pune, MH' })])
    expect(searchReport(index, 'MH', 30, 'CITY').total).toBe(0)
    expect(searchReport(index, 'pune MH', 30, 'LOCATION').results[0].kind).toBe('LOCATION')
    expect(searchReport(index, 'ORDER-1', 30, 'ORDER').results[0].orderId).toBe('ORDER-1')
    expect(searchReport(index, 'pune', 30, 'ORDER').total).toBe(0)
    expect(searchReport(index, 'ORDER-1', 30, 'LOCATION').total).toBe(0)
  })
  it('keeps normalized SKU aliases separate from configured product identities', () => {
    const options = { normalizeSku: (value: string) => value.replace('-CHANNEL', ''), productAliases: [{ sku:'SKU-RED-CHANNEL', aliases:['IDENTITY-123'] }] }
    const index = buildReportSearchIndex(events, options)
    expect(searchReport(index, 'sku-red-channel', 30, 'SKU').results[0].sku).toBe('SKU-RED')
    expect(searchReport(index, 'sku-red-channel', 30, 'IDENTITY').total).toBe(0)
    const ambiguous = buildReportSearchIndex([...events, event('collision', { sku:'SKU-RED-CHANNEL' })], options)
    expect(searchReport(ambiguous, 'identity-123', 30, 'IDENTITY').total).toBe(0)
  })
  it('bounds visible results while reporting the full count and handles empty searches', () => {
    const index = buildReportSearchIndex(events)
    expect(searchReport(index, 'red', 1)).toMatchObject({ total: 2, results: [expect.any(Object)] })
    expect(searchReport(index, ' ')).toEqual({ total: 0, results: [] })
  })
})
