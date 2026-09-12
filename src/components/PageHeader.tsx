import type { ReactNode } from 'react'

export function PageHeader({ eyebrow, title, description, action }: { readonly eyebrow: string; readonly title: string; readonly description: string; readonly action?: ReactNode }) {
  return <section className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action ? <div className="page-header-action">{action}</div> : null}</section>
}
