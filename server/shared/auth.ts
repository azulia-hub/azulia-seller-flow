import { createHash, randomBytes } from 'node:crypto'
import { SharedError } from './errors'
import { validOwnerPasswordHash, verifyOwnerPassword } from './password'

export interface WorkspaceUser { id: string; email: string }
export interface WorkspaceSession extends WorkspaceUser {
  accessHash: string; refreshHash: string; passwordVersion: string
  accessExpiresAt: number; refreshExpiresAt: number
}
export interface OwnerAuthRepository {
  allowLogin(bucket: string, now: number, limit: number): Promise<boolean>
  ensureUser(email: string): Promise<WorkspaceUser>
  saveSession(session: WorkspaceSession): Promise<void>
  findAccess(accessHash: string, now: number): Promise<WorkspaceSession | null>
  renew(refreshHash: string, accessHash: string, email: string, passwordVersion: string, now: number, accessUntil: number): Promise<WorkspaceSession | null>
  revoke(accessHash: string): Promise<void>
}
const accessDuration = 15 * 60000, refreshDuration = 12 * 3600000
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const token = () => randomBytes(32).toString('base64url')
const validToken = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value)

/** Owner-only initial deployment. No public registration or caller-selected owner. */
export class OwnerAuth {
  private readonly email: string
  private readonly passwordHash: string
  private readonly passwordVersion: string
  constructor(environment: Record<string, string | undefined>, private readonly repository: OwnerAuthRepository, private readonly clock = Date.now) {
    this.email = (environment.AZULIA_OWNER_EMAIL ?? '').trim().toLowerCase()
    this.passwordHash = environment.AZULIA_OWNER_PASSWORD_HASH ?? ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email) || this.email.length > 320 || !validOwnerPasswordHash(this.passwordHash)) {
      throw new SharedError('Set AZULIA_OWNER_EMAIL and AZULIA_OWNER_PASSWORD_HASH in Netlify. See the shared setup guide.')
    }
    this.passwordVersion = hash(`${this.email}:${this.passwordHash}`)
  }
  async login(email: string, password: string, clientAddress: string) {
    const now = this.clock()
    // The IP comes from Netlify's trusted function context, never from JSON or an arbitrary forwarded header.
    const ipAllowed = await this.repository.allowLogin(`ip:${hash(clientAddress || 'unknown')}`, now, 10)
    const ownerAllowed = await this.repository.allowLogin(`owner:${hash(this.email)}`, now, 60)
    if (!ipAllowed || !ownerAllowed) throw new SharedError('Too many sign-in attempts. Wait 15 minutes before retrying.', 429)
    const correctPassword = await verifyOwnerPassword(password, this.passwordHash)
    if (email.trim().toLowerCase() !== this.email || !correctPassword) throw new SharedError('Sign-in failed. Check your workspace email and password.', 401)
    const user = await this.repository.ensureUser(this.email), access = token(), refresh = token()
    await this.repository.saveSession({ ...user, accessHash: hash(access), refreshHash: hash(refresh), passwordVersion: this.passwordVersion, accessExpiresAt: now + accessDuration, refreshExpiresAt: now + refreshDuration })
    return { access_token: access, refresh_token: refresh, expires_at: Math.floor((now + accessDuration) / 1000) }
  }
  async refresh(refresh: string) {
    if (!validToken(refresh)) throw new SharedError('Your workspace session expired. Sign in again.', 401)
    const now = this.clock(), access = token()
    // Refresh token has a fixed 12-hour lifetime. A lost refresh response can safely be retried.
    const session = await this.repository.renew(hash(refresh), hash(access), this.email, this.passwordVersion, now, now + accessDuration)
    if (!session) throw new SharedError('Your workspace session expired. Sign in again.', 401)
    return { access_token: access, refresh_token: refresh, expires_at: Math.floor(session.accessExpiresAt / 1000) }
  }
  async authenticate(authorization: string): Promise<WorkspaceUser> {
    const access = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
    if (!validToken(access)) throw new SharedError('Sign in to your workspace.', 401)
    const session = await this.repository.findAccess(hash(access), this.clock())
    if (!session || session.email !== this.email || session.passwordVersion !== this.passwordVersion) throw new SharedError('Your workspace session expired. Sign in again.', 401)
    return { id: session.id, email: session.email }
  }
  async logout(authorization: string) {
    const access = authorization.slice(7)
    if (validToken(access)) await this.repository.revoke(hash(access))
  }
}
