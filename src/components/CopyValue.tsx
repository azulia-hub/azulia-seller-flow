import { useState } from 'react'

export function CopyValue({ label, value }: { label: string; value: string }) {
  const [status, setStatus] = useState('')
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setStatus(`${label} copied`)
    } catch {
      setStatus(`Select and copy this ${label} manually`)
    }
  }
  return <span className="copy-value">
    <button type="button" className="text-btn" onClick={() => void copy()}>Copy {label}</button>
    {status ? <small role="status">{status}</small> : null}
  </span>
}
