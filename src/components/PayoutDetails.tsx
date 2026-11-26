import { useState } from 'react'
import { formatInr } from '../adapters/formatting/currency'
import { cents } from '../adapters/amazon-report-sync/money'
import { payoutReconciliation, settlementActivityByCategory, type BankCredit, type SettlementActivity } from '../core/cashflow/payoutReconciliation'
import type { PayoutGroup } from '../core/cashflow/weeklyPayout'
import { CopyValue } from './CopyValue'

const money = (minor: number | null | undefined) => minor == null ? 'Unavailable' : formatInr(minor / 100)

function creditKey(account: string, groupId: string) {
  return 'azulia:bank-credit:v1:' + JSON.stringify([account, groupId])
}

export function loadPayoutCredit(account: string, groupId: string): BankCredit | undefined {
  const key = creditKey(account, groupId)
  try {
    const credit = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (credit && Number.isSafeInteger(credit.amountMinor) && credit.amountMinor > 0 &&
        typeof credit.date === 'string' && typeof credit.reference === 'string') return credit
  } catch { /* Unavailable storage is surfaced if the user tries to save. */ }
}

function ActivityCategory({ category, rows, total }: ReturnType<typeof settlementActivityByCategory>[number]) {
  const [limit, setLimit] = useState(20)
  return <details>
    <summary>{category} · {money(total)}</summary>
    <ul>{rows.slice(0, limit).map(row => <li key={row.id}>
      {row.label} · {row.postedAt.slice(0, 10) || 'Date unavailable'} · {money(row.amountMinor)}
    </li>)}</ul>
    {limit < rows.length ? <button type="button" className="secondary" onClick={() => setLimit(limit + 20)}>Show more entries</button> : null}
  </details>
}

export function PayoutDetails({ account, group, activity = [], onCreditChange }: {
  account: string; group: PayoutGroup; activity?: readonly SettlementActivity[]; onCreditChange?: () => void
}) {
  const key = creditKey(account, group.id)
  const [credit, setCredit] = useState(() => loadPayoutCredit(account, group.id))
  const [amount, setAmount] = useState(credit ? (credit.amountMinor / 100).toFixed(2) : '')
  const [date, setDate] = useState(credit?.date ?? '')
  const [reference, setReference] = useState(credit?.reference ?? '')
  const [message, setMessage] = useState('')
  const result = payoutReconciliation(group, activity, credit)
  const minor = Number(cents(amount) ?? 0n)
  const canSave = Number.isSafeInteger(minor) && minor > 0 && Boolean(date)
  const statuses = {
    UNAVAILABLE: 'Bank matching unavailable',
    AWAITING: 'Awaiting bank match',
    MATCHED: 'Bank credit matched manually',
    DIFFERENCE: 'Bank amount differs',
    DATE_REVIEW: 'Bank credit date is before the transfer date',
  }
  function save(next?: BankCredit) {
    try {
      if (next) localStorage.setItem(key, JSON.stringify(next))
      else localStorage.removeItem(key)
      setCredit(next)
      onCreditChange?.()
      setMessage(next ? 'Bank credit saved on this device.' : 'Bank credit cleared.')
      if (!next) { setAmount(''); setDate(''); setReference('') }
    } catch {
      setMessage('Bank credit could not be updated on this device.')
    }
  }
  return <section className="seller-feature-panel" aria-label="Payout details">
    <p>Settlement {group.id} <CopyValue label="settlement ID" value={group.id} /></p>
    {group.traceReference ? <p>Transfer reference {group.traceReference} <CopyValue label="payout reference" value={group.traceReference} /></p> : null}
    <dl className="seller-feature-fields">
      <div><dt>Opening balance</dt><dd>{money(group.openingMinor)}</dd></div>
      <div><dt>Linked activity</dt><dd>{money(result.activityMinor)}</dd></div>
      <div><dt>Calculated from available data</dt><dd>{money(result.calculated)}</dd></div>
      <div><dt>{group.open ? 'Amazon open balance' : 'Amazon settlement amount'}</dt><dd>{money(group.amountMinor)}</dd></div>
      <div><dt>Settlement difference</dt><dd>{money(result.settlementDifference)}</dd></div>
    </dl>
    <p>The settlement check uses linked transactions already synced to this device. Source coverage can be incomplete.</p>
    {activity.length > 0 ? <details>
      <summary>Linked activity breakdown ({activity.length} {activity.length === 1 ? 'transaction' : 'transactions'})</summary>
      {settlementActivityByCategory(activity).map(category => <ActivityCategory key={category.category} {...category} />)}
    </details> : <p>No released transactions are linked in the current cache.</p>}
    {result.bankStatus !== 'UNAVAILABLE' ? <>
      <h4>Bank deposit check</h4>
      <p>{statuses[result.bankStatus]} · Amazon transfer {money(result.transfer)}
        {result.bankDifference !== null ? ` · Bank minus transfer ${money(result.bankDifference)}` : ''}</p>
      {credit ? <p>Recorded credit {money(credit.amountMinor)} on {credit.date}{credit.reference ? ` · ${credit.reference}` : ''}</p> : null}
      <form className="seller-feature-fields" onSubmit={event => {
        event.preventDefault()
        if (canSave) save({ amountMinor: minor, date, reference: reference.trim() })
      }}>
        <label>Bank credit (₹)<input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></label>
        <label>Credit date<input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label>
        <label>Bank reference (optional)<input value={reference} maxLength={128} onChange={event => setReference(event.target.value)} /></label>
        <button className="primary" disabled={!canSave}>Save bank credit</button>
        {credit ? <button type="button" className="secondary" onClick={() => save()}>Clear saved credit</button> : null}
      </form>
      <small role="status">{message}</small>
    </> : <p>{statuses.UNAVAILABLE}. A positive confirmed INR transfer is required.</p>}
  </section>
}
