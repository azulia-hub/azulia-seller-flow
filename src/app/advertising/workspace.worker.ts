/// <reference lib="webworker" />
import { calculateAdvertisingWorkspace, type AdvertisingCalculationInput } from './calculateWorkspace'
const worker = self as unknown as DedicatedWorkerGlobalScope
worker.onmessage = (event: MessageEvent<{ id: number; input: AdvertisingCalculationInput }>) => {
  try { worker.postMessage({ id: event.data.id, model: calculateAdvertisingWorkspace(event.data.input) }) }
  catch (cause) { worker.postMessage({ id: event.data.id, error: cause instanceof Error ? cause.message : 'Advertising calculation failed. Previous results retained.' }) }
}
