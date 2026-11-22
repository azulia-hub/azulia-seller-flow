import { useEffect, useRef, useState } from 'react'
import type { AdvertisingCalculationInput } from './calculateWorkspace'
import type { AdvertisingWorkspaceModel } from '../../features/advertising-workspace/contract'

/** Keep one calculation in flight, coalesce changes, and ignore obsolete responses. */
export function useAdvertisingCalculation(input: AdvertisingCalculationInput) {
  const [state, setState] = useState<{ model: AdvertisingWorkspaceModel | null; pending: boolean; error: string | null }>({ model: null, pending: true, error: null })
  const worker = useRef<Worker | null>(null), inFlight = useRef(false), nextId = useRef(0), queued = useRef<{ id: number; input: AdvertisingCalculationInput } | null>(null)
  const dispatch = useRef(() => {})
  useEffect(() => {
    const instance = new Worker(new URL('./workspace.worker.ts', import.meta.url), { type: 'module' })
    worker.current = instance
    dispatch.current = () => {
      if (!worker.current || inFlight.current || !queued.current) return
      const request = queued.current; queued.current = null; inFlight.current = true
      instance.postMessage(request)
    }
    instance.onmessage = (event: MessageEvent<{ id: number; model?: AdvertisingWorkspaceModel; error?: string }>) => {
      inFlight.current = false
      if (event.data.id === nextId.current) setState(previous => ({ model: event.data.model ?? previous.model, pending: false, error: event.data.error ?? null }))
      dispatch.current()
    }
    instance.onerror = () => { inFlight.current = false; setState(previous => ({ ...previous, pending: false, error: 'Advertising calculation worker failed. Saved source data is retained; reload the page to retry.' })) }
    dispatch.current()
    return () => { instance.terminate(); worker.current = null; inFlight.current = false }
  }, [])
  useEffect(() => {
    queued.current = { id: ++nextId.current, input }
    setState(previous => ({ ...previous, pending: true }))
    dispatch.current()
  }, [input])
  return state
}
