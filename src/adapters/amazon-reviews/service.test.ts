import { describe, it, expect, vi } from 'vitest'
import { sendReview, type ReviewContext } from './service'
import type { ReviewTransport } from './transport'
import type { InventoryStorage } from '../amazon-inventory/workspaceTypes'
import { initialReviews, initialReviewSettings, type ReviewWorkspace, type ReviewSettings } from '../../core/review-requests/types'

function createMockStorage() {
  const map = new Map<string, { version: number; value: unknown }>()
  return {
    map,
    async get<T>(key: string) {
      const entry = map.get(key)
      return { version: entry?.version ?? 0, value: (entry?.value as T) ?? null }
    },
    async put(key: string, value: unknown, version?: number) {
      const current = map.get(key)
      if (version !== undefined && version !== (current?.version ?? 0)) {
        throw Object.assign(new Error('Conflict'), { status: 409 })
      }
      const nextVer = (current?.version ?? 0) + 1
      map.set(key, { version: nextVer, value })
      return { version: nextVer }
    },
  } as InventoryStorage & { map: Map<string, { version: number; value: unknown }> }
}

describe('Amazon Reviews Service Dispatch Boundary', () => {
  const account = 'acc_test_123'
  const freshOrdersAt = new Date().toISOString()
  const context: ReviewContext = {
    account,
    orders: [
      {
        id: 'ORDER-1',
        purchased: '2026-11-01T00:00:00Z',
        status: 'Delivered',
        replacement: false,
        replaces: null,
        earliestDelivery: '2026-11-05T00:00:00Z',
        latestDelivery: '2026-11-08T00:00:00Z',
        verifiedAt: null,
      },
    ],
    freshOrdersAt,
  }

  it('rejects dispatch if freshOrdersAt is older than 5 minutes', async () => {
    const storage = createMockStorage()
    const transport: ReviewTransport = {
      order: vi.fn(),
      eligible: vi.fn(),
      submit: vi.fn(),
    }
    const staleContext: ReviewContext = {
      ...context,
      freshOrdersAt: new Date(Date.now() - 6 * 60000).toISOString(),
    }

    await expect(sendReview(storage, staleContext, 'ORDER-1', transport, 'manual', new AbortController().signal))
      .rejects.toThrowError(/Refresh recent orders before sending/)
    expect(transport.submit).not.toHaveBeenCalled()
  })

  it('reverts sending state without marking uncertain if cancelled before dispatch', async () => {
    const storage = createMockStorage()
    const workspace = initialReviews(account)
    workspace.records['ORDER-1'] = {
      orderId: 'ORDER-1',
      state: 'eligible',
      reason: 'Eligible',
      nextCheck: null,
      checkedAt: new Date().toISOString(),
    }
    await storage.put(`reviews:${account}`, workspace, 0)

    const controller = new AbortController()
    const transport: ReviewTransport = {
      order: vi.fn().mockResolvedValue(context.orders[0]),
      eligible: vi.fn().mockResolvedValue(true),
      submit: vi.fn().mockImplementation(() => {
        throw new Error('Should not reach transport.submit')
      }),
    }

    // Abort controller before dispatch
    controller.abort()

    await expect(sendReview(storage, context, 'ORDER-1', transport, 'manual', controller.signal, workspace))
      .rejects.toThrowError()

    const updatedWorkspace = (await storage.get<ReviewWorkspace>(`reviews:${account}`)).value
    expect(updatedWorkspace?.records['ORDER-1'].state).toBe('eligible')
    expect(updatedWorkspace?.records['ORDER-1'].state).not.toBe('uncertain')
    expect(transport.submit).not.toHaveBeenCalled()
  })

  it('marks state as uncertain if error occurs after transport.submit is dispatched', async () => {
    const storage = createMockStorage()
    const workspace = initialReviews(account)
    workspace.records['ORDER-1'] = {
      orderId: 'ORDER-1',
      state: 'eligible',
      reason: 'Eligible',
      nextCheck: null,
      checkedAt: new Date().toISOString(),
    }
    await storage.put(`reviews:${account}`, workspace, 0)

    const transport: ReviewTransport = {
      order: vi.fn().mockResolvedValue(context.orders[0]),
      eligible: vi.fn().mockResolvedValue(true),
      submit: vi.fn().mockRejectedValue(new Error('Network drop while waiting for Amazon confirmation')),
    }

    await expect(sendReview(storage, context, 'ORDER-1', transport, 'manual', new AbortController().signal, workspace))
      .rejects.toThrowError(/Network drop/)

    const updatedWorkspace = (await storage.get<ReviewWorkspace>(`reviews:${account}`)).value
    expect(updatedWorkspace?.records['ORDER-1'].state).toBe('uncertain')
    expect(updatedWorkspace?.records['ORDER-1'].reason).toContain('verify in Seller Central')
    expect(transport.submit).toHaveBeenCalledOnce()
  })

  it('rechecks automation consent at the dispatch boundary and stops if disabled', async () => {
    const storage = createMockStorage()
    const workspace = initialReviews(account)
    workspace.records['ORDER-1'] = {
      orderId: 'ORDER-1',
      state: 'eligible',
      reason: 'Eligible',
      nextCheck: null,
      checkedAt: new Date().toISOString(),
    }
    await storage.put(`reviews:${account}`, workspace, 0)

    // Config has autoEnabled: false
    const config: ReviewSettings = { ...initialReviewSettings(), autoEnabled: false }
    await storage.put(`reviews-config:${account}`, config, 0)

    const transport: ReviewTransport = {
      order: vi.fn(),
      eligible: vi.fn(),
      submit: vi.fn(),
    }

    await expect(sendReview(storage, context, 'ORDER-1', transport, 'automatic', new AbortController().signal, workspace))
      .rejects.toThrowError(/Automatic sending is off/)

    expect(transport.submit).not.toHaveBeenCalled()
  })

  it('rechecks replacement exclusion at dispatch boundary and prevents submission', async () => {
    const storage = createMockStorage()
    const workspace = initialReviews(account)
    workspace.records['ORDER-1'] = {
      orderId: 'ORDER-1',
      state: 'eligible',
      reason: 'Eligible',
      nextCheck: null,
      checkedAt: new Date().toISOString(),
    }
    // Blocked replacement
    workspace.blocked['ORDER-1'] = true
    await storage.put(`reviews:${account}`, workspace, 0)

    const transport: ReviewTransport = {
      order: vi.fn(),
      eligible: vi.fn(),
      submit: vi.fn(),
    }

    await expect(sendReview(storage, context, 'ORDER-1', transport, 'manual', new AbortController().signal, workspace))
      .rejects.toThrowError(/Replacement chain excluded/)

    expect(transport.submit).not.toHaveBeenCalled()
  })
})
