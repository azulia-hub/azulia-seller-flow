import { useEffect, useRef, useState } from 'react'
import { PageHeader } from '../../components/PageHeader'
import { startLabelCutter } from '../../adapters/browser/labelCutter'
import type { CutterResult } from '../../adapters/amazon-labels/types'
import './tools.css'

function useDownloadUrl(data: Uint8Array<ArrayBuffer> | string | undefined, type: string) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (data === undefined) { setUrl(''); return }
    const next = URL.createObjectURL(new Blob([data], { type }))
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [data, type])
  return url
}
function DownloadResult({ result }: { result: CutterResult }) {
  const pdfUrl = useDownloadUrl(result.pdf, 'application/pdf')
  const packingUrl = useDownloadUrl(result.packingPdf, 'application/pdf')
  const csvUrl = useDownloadUrl(result.packingCsv, 'text/csv;charset=utf-8')
  return <section className="pdf-result" aria-label="Prepared labels">
    <div role="status"><h3>Your labels are ready</h3><p><strong>{result.labels} labels</strong> · {result.units} ordered units · {result.pages} A4 {result.pages === 1 ? 'sheet' : 'sheets'}</p></div>
    <div className="pdf-downloads">{pdfUrl ? <a className="primary" href={pdfUrl} download="amazon-labels.pdf">Download labels PDF</a> : null}{packingUrl ? <a className="secondary" href={packingUrl} download="amazon-labels-packing-list.pdf">Packing list PDF</a> : null}{csvUrl ? <a className="secondary" href={csvUrl} download="amazon-labels-packing-list.csv">Packing list CSV</a> : null}</div>
    <p className="pdf-print-note"><strong>Print on A4 at actual size / 100%.</strong> Choose one PDF page per sheet; four labels are already arranged. Check a printed sample before a large batch.</p>
    <details><summary>View file counts and products</summary><ul>{result.sources.map((source, index) => <li key={index}>{source.name} — {source.labels} labels</li>)}</ul><div className="pdf-product-list">{result.products.map((p, index) => <div key={index}><span>{p.product}</span><strong>{p.quantity} units · {p.parcels} parcels</strong></div>)}</div></details>
    {pdfUrl ? <p><a href={pdfUrl} target="_blank" rel="noreferrer">Open PDF preview in a new tab</a></p> : null}
  </section>
}
export function ToolsPage() {
  const [files, setFiles] = useState<File[]>([]), [packingList, setPackingList] = useState(false)
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(''), [error, setError] = useState('')
  const [result, setResult] = useState<CutterResult | null>(null), [dragging, setDragging] = useState(false)
  const job = useRef<ReturnType<typeof startLabelCutter> | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => () => { job.current?.cancel(); job.current = null }, [])
  function addFiles(incoming: File[]) {
    if (busy) return
    if (incoming.some(file => !/\.pdf$/i.test(file.name))) { setError('Choose PDF files only.'); return }
    setFiles(current => [...current, ...incoming.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)])
    setError(''); setResult(null)
  }
  function updateFiles(next: File[]) { setFiles(next); setResult(null); setError('') }
  function move(index: number, delta: number) { const next = [...files]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; updateFiles(next) }
  async function generate() {
    setBusy(true); setError(''); setResult(null)
    const current = startLabelCutter(files, { packingList }, setProgress)
    job.current = current
    try { const next = await current.result; if (job.current === current) setResult(next) }
    catch (error) { if (job.current === current && !(error instanceof DOMException && error.name === 'AbortError')) setError(error instanceof Error ? error.message : 'Unable to prepare these PDFs.') }
    finally { if (job.current === current) { job.current = null; setBusy(false); setProgress('') } }
  }
  function cancel() { job.current?.cancel(); job.current = null; setBusy(false); setProgress(''); setError('Processing cancelled. No output was created.') }
  return <div className="tools-page">
    <PageHeader eyebrow="Workspace" title="Tools" description="Everyday seller tools. Your files stay on your device." />
    <section className="pdf-cutter" aria-labelledby="pdf-cutter-title">
      <div className="pdf-cutter-intro"><span className="eyebrow">Print preparation</span><h2 id="pdf-cutter-title">Amazon PDF Cutter</h2><p>Turn original Easy Ship PDFs into four shipping labels per A4 sheet, with full product names and bold order quantities.</p></div>
      <div className={`pdf-dropzone ${dragging ? 'is-dragging' : ''}`} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files)) }}>
        <span className="pdf-drop-icon" aria-hidden="true">⇧</span><h3>Choose your original Amazon PDFs</h3><p>Select one or several files, or drop them here.</p><button className="secondary" disabled={busy} onClick={() => input.current?.click()}>Choose PDFs</button><input ref={input} type="file" accept=".pdf,application/pdf" multiple aria-label="Amazon label PDFs" disabled={busy} onChange={event => { addFiles(Array.from(event.target.files ?? [])); event.target.value = '' }} /><small>Connect for the first run. Reuse offline once the tool has loaded.</small>
      </div>
      {files.length ? <div className="pdf-queue"><div className="pdf-queue-heading"><h3>{files.length} {files.length === 1 ? 'file' : 'files'} selected</h3><button className="text-btn" disabled={busy} onClick={() => updateFiles([])}>Clear files</button></div><p>Labels follow this file order, then page order. Use the arrows to rearrange files.</p><ol>{files.map((file, index) => <li key={`${index}:${file.name}`}><span className="pdf-file-name">{file.name}<small>{(file.size / 1024 / 1024).toFixed(1)} MB</small></span><div className="pdf-file-actions"><button className="secondary" aria-label={`Move ${file.name} up`} disabled={busy || index === 0} onClick={() => move(index, -1)}>↑</button><button className="secondary" aria-label={`Move ${file.name} down`} disabled={busy || index === files.length - 1} onClick={() => move(index, 1)}>↓</button><button className="text-btn" aria-label={`Remove ${file.name}`} disabled={busy} onClick={() => updateFiles(files.filter((_, i) => i !== index))}>Remove</button></div></li>)}</ol></div> : null}
      <label className="pdf-packing-choice"><input type="checkbox" checked={packingList} disabled={busy} onChange={event => { setPackingList(event.target.checked); setResult(null) }} /><span>Also create a product-wise packing list <small>PDF and CSV with ordered quantities and parcel counts.</small></span></label>
      <div className="pdf-run-actions"><button className="primary" disabled={busy || !files.length} onClick={() => void generate()}>{busy ? 'Preparing labels…' : 'Prepare labels'}</button>{busy ? <button className="secondary" onClick={cancel}>Cancel</button> : null}</div>
      {busy ? <p role="status" aria-live="polite">{progress}</p> : null}
      {error ? <p className="pdf-error" role="alert">{error}</p> : null}
      {result ? <DownloadResult result={result} /> : null}
      <details className="pdf-supported"><summary>Supported files and output</summary><p>Use original, unrotated A4 Amazon PDFs with two labels per page (1216 × 1824 or 1200 × 1800 label images). Business labels followed by their two invoice pages are supported too.</p><p>The output keeps the original shipping images and barcode pixels. Separate invoices are excluded. Product names, sizes and pack descriptions remain complete; QTY counts ordered units or packs.</p><p>Duplicate labels, unsupported layouts, uncertain quantities and names that cannot fit legibly stop the whole batch with an error.</p></details>
    </section>
  </div>
}
