import { randomUUID } from 'node:crypto'
import type { OwnerAuthRepository, WorkspaceSession, WorkspaceUser } from './auth'
import type { SharedDatabase } from './database'

interface SessionRow {
  id: string; email: string; access_hash: string; refresh_hash: string
  password_version: string; access_expires_at: number | string; refresh_expires_at: number | string
}
function session(row?: SessionRow): WorkspaceSession | null {
  return row ? { id: row.id, email: row.email, accessHash: row.access_hash, refreshHash: row.refresh_hash, passwordVersion: row.password_version, accessExpiresAt: Number(row.access_expires_at), refreshExpiresAt: Number(row.refresh_expires_at) } : null
}
export class SqlOwnerAuthRepository implements OwnerAuthRepository {
  constructor(private readonly database: SharedDatabase) {}
  async allowLogin(bucket: string, now: number, limit: number) {
    const rows = await this.database.query<{ allowed: boolean }>('select public.azulia_auth_attempt($1,$2::bigint,$3::integer) as allowed', [bucket,now,limit])
    return rows[0]?.allowed === true
  }
  async ensureUser(email: string): Promise<WorkspaceUser> {
    const rows = await this.database.query<WorkspaceUser>('insert into public.azulia_users(id,email) values($1::uuid,$2) on conflict(email) do update set email=excluded.email returning id,email', [randomUUID(),email])
    return rows[0]
  }
  async saveSession(value: WorkspaceSession) {
    await this.database.query('delete from public.azulia_sessions where refresh_expires_at < $1::bigint', [Date.now()])
    await this.database.query('insert into public.azulia_sessions(owner,access_hash,refresh_hash,password_version,access_expires_at,refresh_expires_at) values($1::uuid,$2,$3,$4,$5::bigint,$6::bigint)', [value.id,value.accessHash,value.refreshHash,value.passwordVersion,value.accessExpiresAt,value.refreshExpiresAt])
  }
  async findAccess(accessHash: string, now: number) {
    const rows = await this.database.query<SessionRow>('select u.id,u.email,s.access_hash,s.refresh_hash,s.password_version,s.access_expires_at,s.refresh_expires_at from public.azulia_sessions s join public.azulia_users u on u.id=s.owner where s.access_hash=$1 and s.access_expires_at>$2::bigint and s.refresh_expires_at>$2::bigint', [accessHash,now])
    return session(rows[0])
  }
  async renew(refreshHash: string, accessHash: string, email: string, passwordVersion: string, now: number, accessUntil: number) {
    const rows = await this.database.query<SessionRow>('update public.azulia_sessions s set access_hash=$2,access_expires_at=least($6::bigint,s.refresh_expires_at) from public.azulia_users u where s.owner=u.id and s.refresh_hash=$1 and u.email=$3 and s.password_version=$4 and s.refresh_expires_at>$5::bigint returning u.id,u.email,s.access_hash,s.refresh_hash,s.password_version,s.access_expires_at,s.refresh_expires_at', [refreshHash,accessHash,email,passwordVersion,now,accessUntil])
    return session(rows[0])
  }
  async revoke(accessHash: string) { await this.database.query('delete from public.azulia_sessions where access_hash=$1', [accessHash]) }
}
