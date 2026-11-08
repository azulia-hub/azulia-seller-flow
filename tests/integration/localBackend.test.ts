import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, writeFile, chmod, symlink, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request as httpRequest } from 'node:http'
import { createLocalServer } from '../../server/local/server'
import { loadCredentials } from '../../server/local/credentials'

const credentials = { AMAZON_SP_CLIENT_ID: 'private-client', AMAZON_SP_CLIENT_SECRET: 'private-secret', AMAZON_SP_REFRESH_TOKEN: 'private-refresh' }
const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
async function directory() {
  const directory = await mkdtemp(join(tmpdir(), 'azulia-local-'))
  cleanups.push(() => rm(directory, { recursive: true, force: true }))
  return directory
}
async function fixture(configured = true) {
  const dir = await directory(), dist = join(dir, 'dist')
  await mkdir(dist)
  await writeFile(join(dist, 'index.html'), '<html>app</html>')
  const upstream = vi.fn<typeof fetch>(async () => Response.json({ access_token: 'private-access', token_type: 'bearer', expires_in: 3600 }))
  const server = createLocalServer({ port: 0, dist, credentials: configured ? credentials : {}, fetch: upstream })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  cleanups.push(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) }))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No test listener')
  const origin = `http://127.0.0.1:${address.port}`
  return { origin, dist, dir, upstream }
}
describe('local backend boundary', () => {
  it('loads only private regular credential files and sanitizes errors', async () => {
    const dir = await directory(), path = join(dir, 'credentials.json')
    expect(await loadCredentials(path)).toEqual({})
    await writeFile(path, JSON.stringify(credentials), { mode: 0o600 })
    expect(await loadCredentials(path)).toEqual(credentials)
    await chmod(path, 0o644)
    await expect(loadCredentials(path)).rejects.toThrow('mode 600')
    await chmod(path, 0o600)
    await symlink(path, join(dir, 'link.json'))
    await expect(loadCredentials(join(dir, 'link.json'))).rejects.toThrow('Cannot load')
    await writeFile(path, 'private-refresh broken json')
    await expect(loadCredentials(path)).rejects.not.toThrow('private-refresh')
  })
  it('serves the local application and responsive connection page', async () => {
    const { origin } = await fixture()
    expect(await (await fetch(origin)).text()).toContain('<html>app')
    const page = await fetch(origin + '/auth/local')
    expect(await page.text()).toContain('name="viewport"')
    expect(page.headers.get('cache-control')).toBe('no-store')
  })
  it('requires same-origin intent before contacting Amazon', async () => {
    const { origin, upstream } = await fixture()
    for (const headers of [{}, { Origin: 'https://evil.example', 'X-Azulia-Intent': 'check-connection' }, { Origin: origin }]) {
      const response = await fetch(origin + '/api/amazon/check', { method: 'POST', headers })
      expect(response.status).toBe(403)
    }
    expect(upstream).not.toHaveBeenCalled()
  })
  it('checks configured credentials without disclosing any token', async () => {
    const { origin, upstream } = await fixture()
    const response = await fetch(origin + '/api/amazon/check', { method: 'POST', headers: { Origin: origin, 'X-Azulia-Intent': 'check-connection' } })
    expect(await response.json()).toEqual({ tokenExchangeVerified: true, apiPermissionsVerified: false })
    expect(upstream).toHaveBeenCalledTimes(1)
    expect(response.headers.has('access-control-allow-origin')).toBe(false)
  })
  it('blocks missing configuration and does not pretend live data is connected', async () => {
    const { origin, upstream } = await fixture(false)
    expect((await fetch(origin + '/api/amazon/check', { method: 'POST', headers: { Origin: origin, 'X-Azulia-Intent': 'check-connection' } })).status).toBe(503)
    expect(await (await fetch(origin + '/api/amazon/status')).json()).toMatchObject({ connected: false })
    expect(upstream).not.toHaveBeenCalled()
  })
  it('never serves files outside dist or follows escaping symlinks', async () => {
    const { origin, dir, dist } = await fixture()
    await writeFile(join(dir, 'credentials.json'), 'private-refresh')
    await symlink(join(dir, 'credentials.json'), join(dist, 'escape.json'))
    expect((await fetch(origin + '/escape.json')).status).toBe(403)
    expect((await fetch(origin + '/.local/amazon-credentials.json')).status).toBe(404)
    expect((await fetch(origin + '/api/unknown')).status).toBe(404)
  })
  it('rejects a rebinding Host header', async () => {
    const { origin } = await fixture()
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = httpRequest(origin, { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode) })
      req.on('error', reject); req.end()
    })
    expect(status).toBe(403)
  })
})

it('does not expose an automatic-delivery controller when it has not been configured', async () => {
  const { origin, upstream } = await fixture(false)
  expect(await (await fetch(origin + '/api/report-sync/status')).json()).toMatchObject({ configured: false, revision: 0 })
  expect((await fetch(origin + '/api/report-sync/range', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json', 'X-Azulia-Intent': 'sync-report' }, body: '{}' })).status).toBe(403)
  expect(upstream).not.toHaveBeenCalled()
})
