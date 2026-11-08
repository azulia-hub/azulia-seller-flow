import { toUnifiedReport } from '../adapters/amazon-report-sync/toUnifiedReport'
import type { SyncSnapshot } from '../adapters/amazon-report-sync/protocol'
const worker = self as unknown as { onmessage: ((event: MessageEvent<SyncSnapshot>) => void) | null; postMessage: (value: unknown) => void }
worker.onmessage = event => {
  try { worker.postMessage({ revision: event.data.revision, connectionKey: event.data.connectionKey, ...toUnifiedReport(event.data) }) }
  catch (cause) { worker.postMessage({ error: cause instanceof Error ? cause.message : 'Automatic report could not be prepared.' }) }
}
