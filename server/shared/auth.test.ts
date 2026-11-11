import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { OwnerAuth, type OwnerAuthRepository, type WorkspaceSession } from './auth'
import { createOwnerPasswordHash } from './password'

class MemoryAuth implements OwnerAuthRepository {
  sessions: WorkspaceSession[] = []
  attempts = new Map<string, { started: number; count: number }>()
  async allowLogin(bucket: string, now: number, limit: number) {
    const saved = this.attempts.get(bucket), state = saved && now-saved.started < 900000 ? saved : {started:now,count:0}
    state.count++;this.attempts.set(bucket,state);return state.count<=limit
  }
  async ensureUser(email: string) { return {id:'12345678-1234-4234-8234-123456789012',email} }
  async saveSession(value: WorkspaceSession) {this.sessions.push({...value})}
  async findAccess(accessHash: string, now: number) {
    return this.sessions.find(value => value.accessHash===accessHash && value.accessExpiresAt>now && value.refreshExpiresAt>now) ?? null
  }
  async renew(refreshHash: string, accessHash: string, email: string, passwordVersion: string, now: number, accessUntil: number) {
    const value=this.sessions.find(row => row.refreshHash===refreshHash && row.email===email && row.passwordVersion===passwordVersion && row.refreshExpiresAt>now)
    if (!value) return null
    value.accessHash=accessHash;value.accessExpiresAt=Math.min(value.refreshExpiresAt,accessUntil);return {...value}
  }
  async revoke(accessHash: string) {this.sessions=this.sessions.filter(value => value.accessHash!==accessHash)}
}

describe('owner workspace authentication (execution deferred)',() => {
  let passwordHash: string, repository: MemoryAuth, now: number, auth: OwnerAuth
  const email='owner@example.test', password='a-private-test-password'
  beforeAll(async () => {passwordHash=await createOwnerPasswordHash(password)})
  beforeEach(() => {
    repository=new MemoryAuth();now=1000000
    auth=new OwnerAuth({AZULIA_OWNER_EMAIL:email,AZULIA_OWNER_PASSWORD_HASH:passwordHash},repository,() => now)
  })
  it('stores session hashes, not bearer/refresh secrets, and derives the owner server-side',async () => {
    const result=await auth.login(email,password,'192.0.2.1')
    expect(repository.sessions[0].accessHash).not.toBe(result.access_token)
    expect(repository.sessions[0].refreshHash).not.toBe(result.refresh_token)
    expect(await auth.authenticate(`Bearer ${result.access_token}`)).toEqual({id:repository.sessions[0].id,email})
    await expect(auth.login('other@example.test',password,'192.0.2.1')).rejects.toMatchObject({status:401})
    await expect(auth.login(email,'incorrect-password','192.0.2.1')).rejects.toMatchObject({status:401})
    expect(repository.sessions).toHaveLength(1)
  })
  it('expires access, allows refresh retries and never extends the absolute session lifetime',async () => {
    const result=await auth.login(email,password,'192.0.2.1'), deadline=repository.sessions[0].refreshExpiresAt
    now+=16*60000
    await expect(auth.authenticate(`Bearer ${result.access_token}`)).rejects.toMatchObject({status:401})
    const first=await auth.refresh(result.refresh_token), retry=await auth.refresh(result.refresh_token)
    expect(retry.access_token).not.toBe(first.access_token)
    expect(repository.sessions[0].refreshExpiresAt).toBe(deadline)
    expect((await auth.authenticate(`Bearer ${retry.access_token}`)).email).toBe(email)
    now=deadline
    await expect(auth.refresh(result.refresh_token)).rejects.toMatchObject({status:401})
  })
  it('revokes the current session on sign-out and rejects sessions after a password-hash change',async () => {
    const result=await auth.login(email,password,'192.0.2.1')
    const changed=new OwnerAuth({AZULIA_OWNER_EMAIL:email,AZULIA_OWNER_PASSWORD_HASH:`scrypt-v1$${'ab'.repeat(16)}$${'cd'.repeat(32)}`},repository,() => now)
    await expect(changed.authenticate(`Bearer ${result.access_token}`)).rejects.toMatchObject({status:401})
    await expect(changed.refresh(result.refresh_token)).rejects.toMatchObject({status:401})
    await auth.logout(`Bearer ${result.access_token}`)
    await expect(auth.authenticate(`Bearer ${result.access_token}`)).rejects.toMatchObject({status:401})
  })
  it('keeps throttling state across auth instances and resumes after the fixed window',async () => {
    await auth.login(email,password,'192.0.2.1')
    const ip=[...repository.attempts.keys()].find(key => key.startsWith('ip:'))!
    repository.attempts.get(ip)!.count=10
    const limited=new OwnerAuth({AZULIA_OWNER_EMAIL:email,AZULIA_OWNER_PASSWORD_HASH:passwordHash},repository,() => now)
    await expect(limited.login(email,password,'192.0.2.1')).rejects.toMatchObject({status:429})
    now+=900000
    const result=await limited.login(email,password,'192.0.2.1')
    expect((await limited.authenticate(`Bearer ${result.access_token}`)).email).toBe(email)
  })
})
