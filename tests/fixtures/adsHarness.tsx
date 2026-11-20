import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AdsConnectionPanel } from '../../src/components/AdsConnectionPanel'
import type { AdsConnectionStatus } from '../../src/app/useAdsConnection'
import '../../src/styles/global.css'
import '../../src/styles/theme.css'
import '../../src/styles/workspace.css'

function Harness() {
  const [enabled, setEnabled] = useState(true), [refreshes, setRefreshes] = useState(0)
  const status: AdsConnectionStatus = { configured: true, renewalConfigured: true, verified: true, accountName: 'Fixture seller', profileId: '1234567890123456', state: refreshes ? 'syncing' : 'idle', revision: 1, lastSync: '2026-11-18T12:00:00Z', error: null, from: '2026-10-20', to: '2026-11-18', rows: 1, pending: refreshes ? 1 : 0 }
  return <main style={{ padding: 16, maxWidth: 900, margin: 'auto' }}><AdsConnectionPanel connection={{ supported: true, enabled, status, error: null, useAutomatic: setEnabled, refresh: async () => { setRefreshes(value => value + 1) } }} /><p data-testid="refresh-count">{refreshes}</p></main>
}
createRoot(document.getElementById('root')!).render(<Harness />)
