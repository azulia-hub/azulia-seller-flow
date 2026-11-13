import { preferences, type AppPreferences } from '../core/settings/preferences'
import { applyPreferences } from '../adapters/preferences/runtime'
import { useEffect, useRef, useState } from 'react'
import { persistentDevice, readDeviceEntry, writeDeviceEntry } from '../adapters/device/workspace'
import { saveProductCosts } from '../adapters/browser/costStore'
import { saveClassificationRules } from '../adapters/browser/classificationRuleStore'

export type { DeviceSettings } from '../core/settings/deviceSettings'
import type { DeviceSettings } from '../core/settings/deviceSettings'

function valid(value: unknown): value is DeviceSettings {
  const settings = value as DeviceSettings | null
  return Boolean(settings && Array.isArray(settings.costs) && settings.costs.every(cost => cost && typeof cost.sku === 'string' && Number.isFinite(cost.unitCost) && typeof cost.updatedAt === 'string') && Array.isArray(settings.rules) && settings.rules.every(rule => rule && typeof rule.id === 'string' && typeof rule.rawType === 'string' && typeof rule.source === 'string' && ['SALE','REFUND','FEE','REIMBURSEMENT','TAX','SETTLEMENT','OTHER','UNKNOWN'].includes(rule.event) && ['OPERATING','SETTLEMENT'].includes(rule.amountClass)) && ['ASSUME_ZERO','BLOCK'].includes(settings.missingCostPolicy))
}

/** The device database owns settings; browser storage is a compatibility mirror. */
export function useDeviceSettings(initial: DeviceSettings, apply: (settings: DeviceSettings) => void) {
  const latest = useRef(initial), callback = useRef(apply), version = useRef(0), initialized = useRef(!persistentDevice)
  callback.current = apply
  const [error, setError] = useState<string | null>(null)
  const queue = useRef(Promise.resolve())
  useEffect(() => {
    if (!persistentDevice) return
    let disposed = false
    void (async () => {
      const saved = await readDeviceEntry<DeviceSettings>('settings')
      if (disposed) return
      if (saved.value !== null && !valid(saved.value)) throw new Error('Saved device settings need review. They have not been overwritten.')
      if (saved.value === null) version.current = (await writeDeviceEntry('settings', latest.current, 0)).version
      else { version.current = saved.version; latest.current = {...saved.value,preferences:saved.value.preferences??latest.current.preferences} }
      if (disposed) return
      latest.current = {...latest.current,preferences:preferences(latest.current.preferences)}
      applyPreferences(latest.current.preferences)
      initialized.current = true; callback.current(latest.current)
    })().catch(cause => { if (!disposed) setError(cause instanceof Error ? cause.message : 'Device settings could not be opened.') })
    return () => { disposed = true }
  }, [])
  function save(patch: Omit<Partial<DeviceSettings>,'preferences'> & {preferences?:Partial<AppPreferences>}): Promise<void> {
    const task = queue.current.then(async () => {
      if (!initialized.current) throw new Error('Device settings are still opening. Reopen the page if this message persists.')
      const next = { ...latest.current, ...patch, preferences:preferences({...preferences(latest.current.preferences),...patch.preferences}) }
      if (!valid(next)) throw new Error('Settings could not be saved: unsupported values.')
      if (persistentDevice) version.current = (await writeDeviceEntry('settings', next, version.current)).version
      try { saveProductCosts(next.costs); saveClassificationRules(next.rules);localStorage.setItem('azulia.missing-cost-policy',next.missingCostPolicy) } catch (cause) { if (!persistentDevice) throw cause }
      latest.current = next; applyPreferences(next.preferences); callback.current(next); setError(null)
    })
    queue.current = task.catch(cause => { setError(cause instanceof Error ? cause.message : 'Device save failed. Previous data is retained.') })
    return queue.current
  }
  return { save, error }
}
