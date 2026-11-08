import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import { cancelHostedConnection, connectHosted, disconnectHosted, hostedView, initializeHosted, stopHosted, subscribeHosted, syncHosted } from '../adapters/amazon-hosted/client'
import './hostedAmazon.css'

export function HostedAmazonConnection({ range, onUseAutomatic }: { range: { from: string; to: string } | null; onUseAutomatic: () => void }) {
  const connection = useSyncExternalStore(subscribeHosted, hostedView, hostedView)
  const [open, setOpen] = useState(false)
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
  const [from, setFrom] = useState(() => new Date(Date.parse(today) - 29 * 86400000).toISOString().slice(0, 10))
  const [to, setTo] = useState(today)
  useEffect(() => { void initializeHosted() }, [])
  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget, values = new FormData(form)
    const credentials = { clientId: String(values.get('clientId') ?? '').trim(), clientSecret: String(values.get('clientSecret') ?? '').trim(), refreshToken: String(values.get('refreshToken') ?? '').trim() }
    form.reset()
    try { await connectHosted(credentials); onUseAutomatic(); setOpen(false) } catch { /* The connection service shows a sanitized error. */ }
  }
  return <section className="hosted-amazon-connection" id="amazon-connection" aria-label="Amazon connection and on-demand sync">
    <div className="hosted-connection-bar"><div><strong>{connection.connected ? 'Amazon connected' : connection.account ? 'Saved Amazon data' : 'Connect Amazon'}</strong><small>{connection.busy ? connection.progress : connection.account ? `${connection.records.toLocaleString('en-IN')} records saved on this device · sync on request` : 'Fetch through Netlify; save and calculate on this device.'}</small></div><div className="hosted-connection-actions">
      {connection.busy ? <button className="secondary" onClick={stopHosted}>Stop sync</button> : <button className="primary" disabled={!connection.connected || connection.connecting} onClick={() => { onUseAutomatic(); void syncHosted(range ?? { from, to }) }}>Sync now</button>}
      <button className="secondary" disabled={connection.busy || connection.connecting} aria-expanded={open} aria-controls="hosted-credential-form" onClick={() => setOpen(value => !value)}>{connection.connected ? 'Change connection' : 'Enter credentials'}</button>
      {connection.connected ? <button className="text-btn" onClick={disconnectHosted}>Forget session</button> : null}
    </div></div>
    {!range ? <div className="hosted-initial-range"><label>From date (India)<input type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} /></label><label>Through date (India)<input type="date" value={to} min={from} max={today} onChange={event => setTo(event.target.value)} /></label></div> : null}
    {open ? <form id="hosted-credential-form" className="hosted-credential-form" method="post" onSubmit={connect} autoComplete="off"><p>Use your own Amazon India app credentials. They stay in this page's memory and pass through the relay over HTTPS; they are not saved to the server or browser storage. Refreshing or closing this page requires reconnecting. Saved reports remain on this device.</p>
      <label>LWA client ID<input name="clientId" required maxLength={1024} autoComplete="off" spellCheck={false} /></label>
      <label>LWA client secret<input name="clientSecret" type="password" required maxLength={2048} autoComplete="off" spellCheck={false} /></label>
      <label>SP-API refresh token<input name="refreshToken" type="password" required maxLength={8192} autoComplete="off" spellCheck={false} /></label>
      <div><button className="primary" disabled={connection.connecting}>{connection.connecting ? 'Connecting…' : 'Connect for this session'}</button><button className="text-btn" type="button" onClick={() => { cancelHostedConnection(); setOpen(false) }}>Cancel</button></div>
      <small>Connecting verifies authorization only. Orders, Finance and Catalog permissions are checked when you request those operations.</small>
    </form> : null}
    {connection.error ? <p role="alert" className="hosted-connection-error">{connection.error}</p> : null}
    {!connection.busy && connection.progress ? <small className="hosted-connection-progress" role="status">{connection.progress}</small> : null}
    {connection.state?.issues.length ? <details className="hosted-source-notes"><summary>Source notes ({connection.state.issues.length})</summary><ul>{connection.state.issues.slice(0, 100).map(issue => <li key={issue}>{issue}</li>)}</ul>{connection.state.issues.length > 100 ? <small>Showing the first 100 notes. All source evidence is retained in this device's cache.</small> : null}</details> : null}
    {connection.state?.catalogError ? <small className="hosted-connection-progress">{connection.state.catalogError}</small> : null}
  </section>
}
