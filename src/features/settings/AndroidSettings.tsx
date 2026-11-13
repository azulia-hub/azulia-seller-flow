import { useEffect, useState } from 'react'
import { currentPreferences } from '../../adapters/preferences/runtime'
import { androidDevice, nativeRequest } from '../../adapters/device/bridge'
type Status = { enabled: boolean; running: boolean; notifications: boolean; message: string; lastExit?: string }
export function AndroidSettings() {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!androidDevice) return
    const refresh = () => { void nativeRequest<Status>('live.status').then(setStatus).catch(e => setError(e.message)) }
    refresh(); const timer = setInterval(refresh, 5000); return () => clearInterval(timer)
  }, [])
  if (!androidDevice) return null
  return <section className="panel settings-preferences"><h3>Automatic Android processing</h3><p>Fetch, calculate and save about every {currentPreferences().syncMinutes} minutes while using other apps or locking your phone. Android may delay checks and limit long background sessions. Your enabled preference is retained, and live sync resumes when you return. Uses more battery. Fetched records and completed calculations are saved automatically, including while away.</p><p>New orders show Pending / Unshipped and FBA / FBM. Refund alerts confirm financial activity, not physical receipt. Product photos appear when Amazon supplies them; old orders do not generate alerts.</p><p role="status">{error || status?.message || 'Reading phone settings…'}</p>{status && !status.notifications ? <small>Allow notifications in the Android prompt or app notification settings.</small> : null}</section>
}
