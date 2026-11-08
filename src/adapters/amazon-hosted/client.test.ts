import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectHosted, disconnectHosted, hostedView, initializeHosted } from './client'

const storage = new Map<string, string>()
const mockLocalStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, val: string) => { storage.set(key, String(val)) },
  removeItem: (key: string) => { storage.delete(key) },
  clear: () => { storage.clear() },
}

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  configurable: true,
  writable: true,
})

vi.mock('./cache', () => ({
  assertLease: vi.fn(),
  commitPage: vi.fn(),
  loadCache: vi.fn(async () => ({ records: [], orders: [], catalog: [], meta: {} })),
  meta: vi.fn(async (account: string) => ({ account, revision: 1, jobs: [], coverage: [], issues: [] })),
  snapshot: vi.fn(async () => ({ records: [], orders: [], coverage: [], revision: 1, connectionKey: 'acc' })),
  updateMeta: vi.fn(async () => {}),
}))

vi.mock('../browser/activeReportStore', () => ({
  saveAnalysisView: vi.fn(),
  loadAnalysisView: vi.fn(),
}))

describe('Hosted Amazon client credential persistence', () => {
  beforeEach(() => {
    storage.clear()
    disconnectHosted()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    disconnectHosted()
    storage.clear()
  })

  it('persists credentials when remember is true and connects', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'test-token-123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const credentials = {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      refreshToken: 'test-refresh-token',
    }

    await connectHosted(credentials, true)

    expect(hostedView().connected).toBe(true)
    expect(hostedView().account).toBeDefined()
    expect(storage.get('azulia.hosted-account')).toBe(hostedView().account)
    expect(storage.get('azulia.hosted-creds')).toBe(JSON.stringify(credentials))

    // Disconnecting clears the stored credentials and session
    disconnectHosted()
    expect(hostedView().connected).toBe(false)
    expect(storage.get('azulia.hosted-creds')).toBeUndefined()
  })

  it('does not persist credentials when remember is false', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'test-token-456' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const credentials = {
      clientId: 'no-persist-client',
      clientSecret: 'no-persist-secret',
      refreshToken: 'no-persist-refresh',
    }

    await connectHosted(credentials, false)

    expect(hostedView().connected).toBe(true)
    expect(storage.get('azulia.hosted-account')).toBe(hostedView().account)
    expect(storage.get('azulia.hosted-creds')).toBeUndefined()
  })

  it('automatically restores connection from stored credentials on initializeHosted', async () => {
    const credentials = {
      clientId: 'stored-client',
      clientSecret: 'stored-secret',
      refreshToken: 'stored-refresh',
    }
    storage.set('azulia.hosted-creds', JSON.stringify(credentials))

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'restored-token-789' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await initializeHosted()

    expect(hostedView().connected).toBe(true)
    expect(hostedView().account).toBeDefined()
  })
})
