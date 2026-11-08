import { expect, it } from 'vitest'
import type { SourceOrderSummary, SyncSnapshot } from './protocol'
import { mergeSnapshot } from './mergeSnapshot'

const record = { transactionId: 'tx', amount: { currencyCode: 'INR', currencyAmount: '100.00' }, unknown: { sourceLabel: 'future' } }
const order: SourceOrderSummary = { id: '111-1234567-1234567', purchased: '2026-11-01T00:00:00Z', status: 'Unshipped', fulfillmentType: 'MFN', orderValue: '1180.00', currency: 'INR' }
const snapshot = (records: Record<string, unknown>[], delta = true): SyncSnapshot => ({ connectionKey: 'account', revision: 2, updatedAt: '2026-11-08T00:00:00Z', coverage: [], records, orders: [order], delta })

it('ignores empty deltas, source timestamps, coverage and revision-only changes', () => {
  const records = [record]
  const result = mergeSnapshot({ ...snapshot([]), coverage: [{ from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00Z' }] }, records, [order])
  expect(result.changed).toBe(false)
  expect(result.snapshot.records).toBe(records)
  expect(result.snapshot.revision).toBe(2)
})

it('does not rebuild unchanged source content because object fields or source rows were reordered', () => {
  const another = { transactionId: 'other', amount: '1.00' }
  const records = [record, another]
  const reordered = { unknown: { sourceLabel: 'future' }, amount: { currencyAmount: '100.00', currencyCode: 'INR' }, transactionId: 'tx' }
  const result = mergeSnapshot(snapshot([another, reordered], false), records, [order])
  expect(result.changed).toBe(false)
  expect(result.snapshot.records).toBe(records)
})

it('recognizes additions, removals and unknown-field changes without discarding unchanged records', () => {
  expect(mergeSnapshot(snapshot([{ transactionId: 'new' }]), [record], [order]).changed).toBe(true)
  expect(mergeSnapshot(snapshot([], false), [record], [order]).changed).toBe(true)
  const changed = mergeSnapshot(snapshot([{ ...record, unknown: { sourceLabel: 'updated' } }]), [record], [order])
  expect(changed.changed).toBe(true)
  expect(changed.snapshot.records[0].unknown).toEqual({ sourceLabel: 'updated' })
})

it('recognizes order-only status changes and order removals without any financial delta', () => {
  expect(mergeSnapshot({ ...snapshot([]), orders: [{ ...order, status: 'Canceled' }] }, [record], [order]).changed).toBe(true)
  expect(mergeSnapshot({ ...snapshot([]), orders: [] }, [record], [order]).changed).toBe(true)
  expect(mergeSnapshot(snapshot([]), null, null).changed).toBe(true)
})

it('rejects a source update without identity instead of treating it as an unchanged record', () => {
  expect(() => mergeSnapshot(snapshot([{ amount: 100 }]), [record], [order])).toThrow('identity')
})
