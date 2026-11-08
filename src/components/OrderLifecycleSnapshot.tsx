import { useEffect, useMemo, useRef, useState } from 'react'
import { cohortExcludedRecords, type OrderCohort } from '../core/analytics/orderLifecycle'
type Props = { cohort: OrderCohort; formatMoney: (value: number) => string; onClose: () => void }
const reasons = { PENDING: 'Release not confirmed', MISSING_DATE: 'Purchase date not verified', OUTSIDE_PERIOD: 'Purchased outside this period' }
export function OrderLifecycleSnapshot({ cohort, formatMoney, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState(''), [reason, setReason] = useState('ALL'), [page, setPage] = useState(0)
  const records = useMemo(() => cohortExcludedRecords(cohort), [cohort])
  const matches = useMemo(() => records.filter(record => (reason === 'ALL' || record.reason === reason) && (!query.trim() || record.orderId?.toLowerCase().includes(query.trim().toLowerCase()))), [records, query, reason])
  const current = Math.min(page, Math.max(0, Math.ceil(matches.length / 15) - 1))
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => { element?.close() } }, [])
  return <dialog ref={dialog} className="excluded-records-dialog" aria-labelledby="excluded-records-title" onCancel={onClose} onClick={event => { const box = event.currentTarget.getBoundingClientRect(); if (event.target === event.currentTarget && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) onClose() }}>
    <header><div><h2 id="excluded-records-title">Excluded financial records <small>{records.length}</small></h2><p>{cohort.range.from} – {cohort.range.to} · Orders by purchase date</p></div><button className="text-btn" aria-label="Close excluded records" onClick={onClose}>✕</button></header>
    <p>Orders outside the selected purchase dates are excluded. Unverified purchase dates need review. Recorded activity on selected orders is included without waiting for release.</p>
    <div className="exclusion-controls"><input type="search" aria-label="Find excluded order" placeholder="Find order ID" value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} /><select aria-label="Exclusion reason" value={reason} onChange={event => { setReason(event.target.value); setPage(0) }}><option value="ALL">All reasons</option>{Object.entries(reasons).filter(([key]) => cohort.inclusion !== 'ALL_RECORDED' || key !== 'PENDING').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
    <div className="excluded-records-list">{matches.slice(current * 15, (current + 1) * 15).map(record => <article key={record.key}><div><strong>{record.orderId ?? 'Account entry'}</strong><small>{record.purchaseDate ? `Purchased ${record.purchaseDate}` : 'Purchase date unavailable'} · {record.components} financial components</small></div><div><span>{reasons[record.reason]}</span><strong>{formatMoney(record.amount)}</strong></div></article>)}{!matches.length ? <p>No excluded records match these filters.</p> : null}</div>
    <footer><small>{matches.length} records · Page {current + 1} of {Math.max(1, Math.ceil(matches.length / 15))}</small><button className="secondary" disabled={!current} onClick={() => setPage(current - 1)}>Previous</button><button className="secondary" disabled={(current + 1) * 15 >= matches.length} onClick={() => setPage(current + 1)}>Next</button></footer>
  </dialog>
}
