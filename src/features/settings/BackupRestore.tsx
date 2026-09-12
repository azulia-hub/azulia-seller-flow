import { useRef, useState } from 'react'

type Props = { readonly importCount: number; readonly costCount: number; readonly ruleCount: number; readonly onExport: () => void; readonly onRestore: (file: File) => Promise<void> }

export function BackupRestore({ importCount, costCount, ruleCount, onExport, onRestore }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function restore(file?: File) {
    if (!file) return
    setBusy(true); setMessage('')
    try { await onRestore(file); setMessage('Backup restored. Your reports, costs and rules are ready in Azulia Seller Flow.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'The backup could not be restored.') }
    finally { setBusy(false); if (input.current) input.current.value = '' }
  }
  return <section className="panel backup-restore"><div className="panel-head"><div><small>Data protection</small><h3>Backup and restore</h3><p>Browser data can be erased by clearing site storage. Keep a private backup on your device.</p></div></div><div className="backup-summary"><span><strong>{importCount}</strong> reports</span><span><strong>{costCount}</strong> costs</span><span><strong>{ruleCount}</strong> rules</span></div><div className="backup-actions"><button className="primary" onClick={onExport}>Download backup</button><button className="secondary" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Restoring…' : 'Restore backup'}</button><input ref={input} type="file" accept="application/json,.json" hidden onChange={event => void restore(event.target.files?.[0])} /></div>{message ? <p role="status" className="backup-message">{message}</p> : null}<small>Restoring replaces the reports, product costs and classification rules currently stored in this browser.</small></section>
}
