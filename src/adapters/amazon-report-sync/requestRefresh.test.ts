import { describe, expect, it, vi } from 'vitest'
import { requestReportRefresh } from './requestRefresh'

describe('requestReportRefresh observer coordination', () => {
  it('allows one observer to abort without cancelling a coalesced sibling observer', async () => {
    // Regression case: Observer A aborting should remove itself from notification list,
    // while Observer B continues receiving status updates until completion.
    const controllerA = new AbortController()
    const controllerB = new AbortController()
    const progressA: string[] = []
    const progressB: string[] = []

    const range = { from: '2026-11-01', to: '2026-11-14' }

    // Mock fetch for web environment fallback
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    })

    try {
      const promiseA = requestReportRefresh(range, false, msg => progressA.push(msg), controllerA.signal)
      const promiseB = requestReportRefresh(range, false, msg => progressB.push(msg), controllerB.signal)

      controllerA.abort()

      await expect(promiseA).rejects.toThrow()
      const outcomeB = await promiseB
      expect(outcomeB).toBe('queued')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
