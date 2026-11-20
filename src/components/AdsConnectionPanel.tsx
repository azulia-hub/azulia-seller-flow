import type { AdsConnection } from '../app/useAdsConnection'
import { androidDevice, nativeRequest } from '../adapters/device/bridge'
import { useState } from 'react'

export function AdsConnectionPanel({ connection }: { connection: AdsConnection }) {
  const [importError, setImportError] = useState<string | null>(null)
  if (!connection.supported) return null
  const { status, error, enabled } = connection
  return <section className="panel settings-preferences" aria-label="Amazon Ads connection">
    <h3>Amazon Ads connection</h3>
    {status?.configured ? <>
      <p><strong>{status.accountName}</strong> · India · Profile {status.profileId}</p>
      <p role="status">{error || status.error || (!status.verified ? 'Checking advertising access…' : status.state === 'syncing' ? `Preparing Sponsored Products reports${status.pending ? ` · ${status.pending} windows remaining` : ''}…` : status.lastSync ? 'Advertising reports connected.' : 'Access verified. Waiting for the first report.')}</p>
      {!status.renewalConfigured ? <p>Add your Ads client secret with <code>npm run ads:setup</code> to renew tokens automatically.</p> : null}
      {status.from && status.to ? <p>Saved report dates: {status.from} – {status.to}. Last received: {status.lastSync ? new Date(status.lastSync).toLocaleString('en-IN') : 'Not yet'}.</p> : null}
      <label className="cost-policy"><input type="checkbox" checked={enabled} onChange={event => connection.useAutomatic(event.target.checked)} /><span>Use connected advertising reports</span></label>
      <button type="button" className="text-btn" disabled={!enabled || status.state === 'syncing'} onClick={() => { void connection.refresh() }}>Refresh advertising reports</button>
      <p className="seller-footnote">Sponsored Products only · Seven-day click attribution · Spend before GST. Amazon prepares reports asynchronously and may revise recent conversions. Initial history is 30 days; selected dates request available history up to 95 days. Saved results remain available during updates. No campaigns or bids are changed.</p>
      {!enabled ? <p>Showing your uploaded workbook. Enable connected reports to use API data.</p> : null}
    </> : <p role="status">{error || status?.error || (androidDevice ? 'Import your Ads setup file to connect advertising on this phone. Your existing seller connection is retained.' : 'Set up the separate Amazon Ads credentials on this computer with npm run ads:setup. Existing seller API access and workbook uploads remain available.')}</p>}
    {androidDevice ? <><button type="button" className="text-btn" onClick={() => { setImportError(null); void nativeRequest('ads.import').catch(() => setImportError('Could not open the Ads setup picker. Reopen the app and try again.')) }}>Import Ads setup file</button>{importError ? <p role="alert">{importError}</p> : null}</> : null}
  </section>
}
