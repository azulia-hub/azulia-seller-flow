import { useMemo, useState } from 'react'
import type { CanonicalDataset, CanonicalEventKind, AmountClass, AmountType } from '../../core/data/types'
import { summarizeUnclassifiedEvents } from '../../core/classification/classificationRules'
import type { ClassificationRule } from '../../core/classification/types'

type Props = { readonly dataset: CanonicalDataset; readonly rules: readonly ClassificationRule[]; readonly formatMoney: (value: number) => string; readonly onSaveRule: (rule: ClassificationRule) => void; readonly onDeleteRule: (id: string) => void }
type Draft = { event: CanonicalEventKind; amountClass: AmountClass; amountType: AmountType }

const categories: readonly { value: CanonicalEventKind; label: string; help: string; amountClass: AmountClass; amountType: AmountType }[] = [
  { value: 'SALE', label: 'Sale income', help: 'Money earned from an order', amountClass: 'OPERATING', amountType: 'PRODUCT_REVENUE' },
  { value: 'REFUND', label: 'Customer refund', help: 'Money returned to a buyer', amountClass: 'OPERATING', amountType: 'PRODUCT_REVENUE' },
  { value: 'FEE', label: 'Marketplace fee', help: 'Commission, service, fulfilment or another fee', amountClass: 'OPERATING', amountType: 'OTHER_FEE' },
  { value: 'REIMBURSEMENT', label: 'Reimbursement', help: 'Money recovered from the marketplace', amountClass: 'OPERATING', amountType: 'OTHER' },
  { value: 'TAX', label: 'Tax', help: 'Tax collected, withheld or adjusted', amountClass: 'OPERATING', amountType: 'TAX' },
  { value: 'OTHER', label: 'Other business adjustment', help: 'Operating activity that does not fit above', amountClass: 'OPERATING', amountType: 'OTHER' },
  { value: 'SETTLEMENT', label: 'Bank transfer / settlement', help: 'A payout movement, excluded from profit', amountClass: 'SETTLEMENT', amountType: 'OTHER' },
]

export function TransactionReviewManager({ dataset, rules, formatMoney, onSaveRule, onDeleteRule }: Props) {
  const summary = useMemo(() => summarizeUnclassifiedEvents(dataset.events), [dataset.events])
  const groups = summary.groups
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const choose = (key: string, event: CanonicalEventKind) => {
    const option = categories.find((item) => item.value === event) ?? categories[5]
    setDrafts((current) => ({ ...current, [key]: { event: option.value, amountClass: option.amountClass, amountType: option.amountType } }))
  }
  return <section className="transaction-review">
    <div className="section-heading"><div><small>Report accuracy</small><h2>Transactions needing review</h2></div><p>Teach Azulia Seller Flow what an unfamiliar transaction label means. The saved rule will be reused for future reports from the same source.</p></div>
    <section className={`review-summary ${groups.length ? 'warning' : 'good'}`}><span>{groups.length ? '!' : '✓'}</span><div><strong>{groups.length ? `${summary.labelCount} unfamiliar labels · ${summary.eventCount} transactions` : 'Every transaction is classified'}</strong><p>{groups.length ? `${formatMoney(summary.amount)} net impact is already included in totals, but needs a category.` : 'There is nothing requiring action in this report.'}</p></div></section>
    {groups.map((group) => {
      const draft = drafts[group.key]
      return <article className="panel review-card" key={group.key}>
        <div className="review-card-head"><div><small>Raw transaction label</small><h3>{group.rawType || '(blank label)'}</h3><p>{group.source} · {group.count} transaction{group.count === 1 ? '' : 's'}</p></div><div className={group.amount >= 0 ? 'review-impact income' : 'review-impact expense'}><small>Net financial impact</small><strong>{formatMoney(group.amount)}</strong></div></div>
        <details className="review-evidence"><summary>See examples from the report</summary><div>{group.descriptions.length ? group.descriptions.map((description) => <p key={description}>{description}</p>) : <p>No description was provided.</p>}{group.orderIds.length ? <small>Example orders: {group.orderIds.join(', ')}</small> : null}<small>Current money types: {group.amountTypes.join(', ')}</small></div></details>
        <div className="classification-action"><label>What does this transaction mean?<select value={draft?.event ?? ''} onChange={(event) => choose(group.key, event.target.value as CanonicalEventKind)}><option value="">Choose a category</option>{categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label><div className="classification-help">{draft ? categories.find((item) => item.value === draft.event)?.help : 'Choose carefully—this determines where the amount appears in your analytics.'}</div><button className="primary" disabled={!draft} onClick={() => draft && onSaveRule({ id: `${group.key}:${Date.now()}`, source: group.source, rawType: group.rawType, ...draft, createdAt: new Date().toISOString() })}>Save and apply</button></div>
      </article>
    })}
    {rules.length ? <details className="saved-rules"><summary>{rules.length} saved classification rule{rules.length === 1 ? '' : 's'}</summary><div>{rules.map((rule) => <div key={rule.id}><span><strong>{rule.rawType || '(blank label)'}</strong><small>{rule.source} → {categories.find((item) => item.value === rule.event)?.label ?? rule.event}</small></span><button className="text-btn danger-text" onClick={() => onDeleteRule(rule.id)}>Remove rule</button></div>)}</div></details> : null}
  </section>
}
