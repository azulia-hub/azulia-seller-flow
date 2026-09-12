import { useRef } from 'react'

interface UploadZoneProps {
  readonly onFile: (file: File) => void | Promise<void>
  readonly loading?: boolean
}

export function UploadZone({ onFile, loading = false }: UploadZoneProps) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button className="upload-mini" type="button" disabled={loading} onClick={() => ref.current?.click()}>
        <span className="upload-icon">↑</span>
        <span><strong>{loading ? 'Importing…' : 'Import report'}</strong><small>CSV or TSV · Excel next</small></span>
      </button>
      <input ref={ref} hidden type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" onChange={(event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file) void onFile(file)
      }}/>
    </>
  )
}
