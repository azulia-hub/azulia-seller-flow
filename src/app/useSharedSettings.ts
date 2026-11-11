import { useEffect, useRef, useState } from 'react'
import { sharedDelivery, sharedRequest, sharedSignedIn } from '../adapters/amazon-shared/client'
import type { CalculationSettings, SharedStatus } from '../adapters/amazon-shared/cache'
export function useSharedSettings(onChange: (settings:CalculationSettings) => void) {
  const latest = useRef(onChange); latest.current = onChange
  const current = useRef<{version:number;settings:CalculationSettings}|null>(null)
  const saving = useRef(false), [error,setError] = useState('')
  useEffect(() => {
    if (!sharedDelivery || !sharedSignedIn()) return
    let active = true, busy = false
    async function poll() {
      if (busy || saving.current) return
      busy = true
      try {
        const status = await sharedRequest<SharedStatus>('status')
        if (active && !saving.current && current.current?.version !== status.settingsVersion) {
          current.current = {version:status.settingsVersion,settings:status.settings}; latest.current(status.settings)
        }
        if (active && !saving.current) setError('')
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Shared settings unavailable.') }
      finally {busy=false}
    }
    void poll(); const timer = setInterval(() => {void poll()},5000)
    return () => {active=false;clearInterval(timer)}
  },[])
  async function save(patch: Partial<CalculationSettings>) {
    if (!current.current || saving.current) {setError('Wait for shared settings to load or finish saving.');return}
    saving.current=true; setError('')
    try {
      const settings = {...current.current.settings,...patch}
      const result = await sharedRequest<{settingsVersion:number}>('settings',{version:current.current.version,settings})
      current.current={version:result.settingsVersion,settings};latest.current(settings)
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Shared settings were not saved.')}
    finally {saving.current=false}
  }
  return {save,error}
}
