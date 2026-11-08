import { createElement } from 'react'
import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AutomaticReportStatus } from './AutomaticReportStatus'
import type { useAutomaticReport } from '../app/useAutomaticReport'
const delivery: ReturnType<typeof useAutomaticReport> = { status: { connectionKey: 'test', configured: true, revision: 5, records: 10, missingWindows: 0, coverage: [], state: 'idle', lastSync: null, nextAttempt: null, error: null, pendingOrderDates: 20 }, phase: 'idle', calculating: false, error: '', lastReading: '2026-11-07T00:00:00Z', appliedRevision: 4, updatesPending: true }
const view = (value: typeof delivery) => renderToStaticMarkup(createElement(AutomaticReportStatus, { delivery: value, enabled: true, issues: [], onAutomatic: () => {}, onManual: () => {} }))
it('shows completed calculations separately from unfinished background purchase-date sync', () => {
  const html = view(delivery)
  expect(html).toContain('Results ready')
  expect(html).toContain('Background sync:')
  expect(html).toContain('20 order dates remaining')
  expect(html).toContain('New data queued')
  expect(html).not.toContain('Calculating new reading')
})
it('keeps last-result guidance during actual calculation and exposes failures without endless spinner text', () => {
  expect(view({ ...delivery, calculating: true, phase: 'calculating' })).toContain('Your saved reading is retained while the dashboard updates.')
  const html = view({ ...delivery, error: 'Calculation timed out.' })
  expect(html).toContain('Results ready')
  expect(html).toContain('Calculation timed out.')
})
