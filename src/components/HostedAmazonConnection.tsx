import { androidDevice } from '../adapters/device/bridge'
import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import { cancelHostedConnection, clearAndResyncHosted, connectHosted, disconnectHosted, hostedView, initializeHosted, subscribeHosted } from '../adapters/amazon-hosted/client'
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
    const remember = values.get('remember') === 'on' || values.get('remember') === 'true'
    form.reset()
    try { await connectHosted(credentials, remember); onUseAutomatic(); setOpen(false) } catch { /* The connection service shows a sanitized error. */ }
  }
  return <section className="hosted-amazon-connection" id="amazon-connection" aria-label="Amazon connection and on-demand sync">
    <div className="hosted-connection-bar"><div><strong>{connection.connected ? 'Amazon connected' : connection.account ? 'Saved Amazon data' : 'Connect Amazon'}{connection.connected && !connection.busy && !connection.error ? <span style={{ marginLeft: 8, fontSize: '0.85em', color: '#10b981', fontWeight: 500 }}>● Auto-sync active</span> : null}</strong><small>{connection.busy ? connection.progress : connection.account ? `${connection.records.toLocaleString('en-IN')} records saved on this device · automatic fetch and calculations` : androidDevice ? 'Connect directly to Amazon; save and calculate on this phone.' : 'Fetch through Netlify; save and calculate on this device.'}</small></div><div className="hosted-connection-actions">
      {connection.connected?<details className="connection-advanced"><summary>Advanced recovery</summary><button className="secondary" disabled={connection.busy} onClick={()=>{onUseAutomatic();void clearAndResyncHosted(range??{from,to})}}>Recheck selected history</button></details>:null}
      <button className="secondary" disabled={connection.busy || connection.connecting} aria-expanded={open} aria-controls="hosted-credential-form" onClick={() => setOpen(value => !value)}>{connection.connected ? 'Change connection' : 'Enter credentials'}</button>
      {connection.connected ? <button className="text-btn" onClick={disconnectHosted}>Forget credentials</button> : null}
    </div></div>
    {connection.busy && connection.percent !== undefined ? <div className="hosted-progress-track" role="progressbar" aria-valuenow={connection.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Sync progress"><div className="hosted-progress-bar" style={{ width: `${connection.percent}%` }} /></div> : null}
    {!range ? <div className="hosted-initial-range"><label>From date (India)<input type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} /></label><label>Through date (India)<input type="date" value={to} min={from} max={today} onChange={event => setTo(event.target.value)} /></label></div> : null}
    {open ? <form id="hosted-credential-form" className="hosted-credential-form" method="post" onSubmit={connect} autoComplete="off">
      <p>{androidDevice ? <>Your Amazon India credentials are encrypted in this app using Android Keystore. They are not saved in browser storage.</> : <>Use your own Amazon India app credentials. When &ldquo;Remember credentials on this device&rdquo; is checked, your credentials are saved in this browser&apos;s local storage so you stay connected when refreshing or reopening the page. Uncheck on shared devices.</>}</p>
      <label>LWA client ID<input name="clientId" required maxLength={1024} autoComplete="off" spellCheck={false} /></label>
      <label>LWA client secret<input name="clientSecret" type="password" required maxLength={2048} autoComplete="off" spellCheck={false} /></label>
      <label>SP-API refresh token<input name="refreshToken" type="password" required maxLength={8192} autoComplete="off" spellCheck={false} /></label>
      {!androidDevice ? <label className="hosted-remember-checkbox">
        <input type="checkbox" name="remember" defaultChecked />
        <span>Remember credentials on this device</span>
      </label> : null}
      <div><button className="primary" disabled={connection.connecting}>{connection.connecting ? 'Connecting…' : 'Connect Amazon'}</button><button className="text-btn" type="button" onClick={() => { cancelHostedConnection(); setOpen(false) }}>Cancel</button></div>
      <small>Connecting verifies authorization only. Orders, Finance and Catalog permissions are checked during automatic synchronization.</small>
    </form> : null}
    {connection.error ? <p role="alert" className="hosted-connection-error">{connection.error}</p> : null}
    {androidDevice && connection.backgroundNote ? <small role="status">{connection.backgroundNote}</small> : null}
    {!connection.busy && connection.progress ? <small className="hosted-connection-progress" role="status">{connection.progress}</small> : null}
    {connection.state?.issues.length ? <details className="hosted-source-notes"><summary>Source notes ({connection.state.issues.length})</summary><ul>{connection.state.issues.slice(0, 100).map(issue => <li key={issue}>{issue}</li>)}</ul>{connection.state.issues.length > 100 ? <small>Showing the first 100 notes. All source evidence is retained in this device's cache.</small> : null}</details> : null}
    {connection.state?.catalogError ? <small className="hosted-connection-progress">{connection.state.catalogError}</small> : null}
  </section>
}
