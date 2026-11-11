import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { SharedCache } from '../../src/adapters/amazon-shared/snapshot'
import type { CacheMeta } from '../../src/adapters/amazon-shared/contracts'

import { netlifyDatabase, type SharedDatabase } from './database'
import { SharedError } from './errors'
export { SharedError } from './errors'
export interface SharedSettings { costs: unknown[]; classificationRules: unknown[]; missingCostPolicy: 'BLOCK' | 'ASSUME_ZERO' }
export interface Account extends SharedCache { version: number; settings: SharedSettings; settingsVersion: number; configured: boolean }
export const accountKey = (owner: string) => createHash('sha256').update(`azulia-shared-v1:${owner}`).digest('hex')
export function emptyMetadata(account: string): CacheMeta {
  return { account, revision: 0, updatedAt: null, lastSync: null, coverage: [], purchaseCoverage: [], jobs: [], orderChecked: {}, historyChecked: {}, nextAllowed: {}, dateFailures: {}, catalogChecked: {}, orderItemsChecked: {}, issues: [], orderDateIssues: 0, catalogError: null }
}
export interface AccountMetadata {
  version: number; metadata: CacheMeta; credentials: string | null
  settings: SharedSettings; settings_version: number
}
export class SharedStore {
  constructor(readonly environment: Record<string, string | undefined>, readonly database: SharedDatabase = netlifyDatabase()) {}
  private async query<Row extends object = Record<string, unknown>>(statement: string, parameters: unknown[] = []): Promise<Row[]> {
    try { return await this.database.query<Row>(statement,parameters) }
    catch { throw new SharedError('Netlify Database is unavailable or its migrations are not applied. The saved checkpoint is retained. See docs/shared-seller-setup.md.') }
  }
  async ensure(owner: string) {
    await this.query('insert into public.azulia_accounts(owner,metadata) values($1::uuid,$2::jsonb) on conflict(owner) do nothing', [owner,JSON.stringify(emptyMetadata(accountKey(owner)))])
  }
  async metadata(owner: string): Promise<AccountMetadata> {
    const rows = await this.query<Omit<AccountMetadata,'version'|'settings_version'> & {version:string|number;settings_version:string|number}>('select version,metadata,credentials,settings,settings_version from public.azulia_accounts where owner=$1::uuid', [owner])
    if (!rows[0]) throw new SharedError('Seller account is unavailable.')
    return {...rows[0],version:Number(rows[0].version),settings_version:Number(rows[0].settings_version)}
  }
  async snapshot(owner: string): Promise<Account> {
    const rows = await this.query<{value:Account|null}>('select public.azulia_snapshot($1::uuid) as value', [owner])
    if (!rows[0]?.value) throw new SharedError('Seller source snapshot is unavailable.')
    return rows[0].value
  }
  async commit(owner: string, version: number, metadata: CacheMeta, writes: {kind: string; id: string; value: unknown}[] = []) {
    const rows = await this.query<{committed:boolean}>('select public.azulia_commit($1::uuid,$2::bigint,$3::jsonb,$4::jsonb) as committed', [owner,version,JSON.stringify(metadata),JSON.stringify(writes)])
    if (rows[0]?.committed !== true) throw new SharedError('Another sync advanced this account. Read the saved checkpoint and retry.',409)
  }
  async saveSettings(owner:string,version:number,settings:unknown) {
    const rows=await this.query<{saved:boolean}>('select public.azulia_settings($1::uuid,$2::bigint,$3::jsonb) as saved', [owner,version,JSON.stringify(settings)])
    return rows[0]?.saved===true
  }
  async readNormalization(owner:string,revision:number,engine:string):Promise<unknown|null> {
    const rows=await this.query<{value:unknown}>('select value from public.azulia_readings where owner=$1::uuid and revision=$2::bigint and engine=$3', [owner,revision,engine])
    return rows[0]?.value ?? null
  }
  async saveNormalization(owner:string,revision:number,engine:string,value:unknown) {
    await this.query('insert into public.azulia_readings(owner,revision,engine,value) values($1::uuid,$2::bigint,$3,$4::jsonb) on conflict(owner) do update set revision=excluded.revision,engine=excluded.engine,value=excluded.value where azulia_readings.revision<=excluded.revision', [owner,revision,engine,JSON.stringify(value)])
  }
  async readCalculation(owner:string,key:string):Promise<unknown|null> {
    const rows=await this.query<{value:unknown}>('select value from public.azulia_calculations where owner=$1::uuid and key=$2', [owner,key])
    return rows[0]?.value ?? null
  }
  async saveCalculation(owner:string,key:string,value:unknown) {
    await this.query('insert into public.azulia_calculations(owner,key,value) values($1::uuid,$2,$3::jsonb) on conflict(owner) do update set key=excluded.key,value=excluded.value', [owner,key,JSON.stringify(value)])
  }
  async connect(owner:string,identity:string,credentials:string) {
    const rows=await this.query<{connected:boolean}>('select public.azulia_connect($1::uuid,$2,$3) as connected', [owner,identity,credentials])
    return rows[0]?.connected===true
  }
  async disconnect(owner:string) { await this.query('update public.azulia_accounts set credentials=null where owner=$1::uuid', [owner]) }
  encrypt(owner: string, value: unknown): string {
    const key = this.encryptionKey(), iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(Buffer.from(owner))
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
    return ['v1',iv.toString('base64'),cipher.getAuthTag().toString('base64'),encrypted.toString('base64')].join('.')
  }
  decrypt(owner: string, value: string): Record<string, string> {
    const [version, iv, tag, data] = value.split('.')
    if (version !== 'v1' || !iv || !tag || !data) throw new SharedError('Stored connection is invalid. Reconnect Amazon.')
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), Buffer.from(iv, 'base64'))
    decipher.setAAD(Buffer.from(owner)); decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')) as Record<string, string>
  }
  private encryptionKey() {
    const value = this.environment.AZULIA_CREDENTIAL_KEY ?? ''
    if (!/^[a-fA-F0-9]{64}$/.test(value)) throw new SharedError('Configure the server credential encryption key before connecting Amazon.')
    return Buffer.from(value, 'hex')
  }
}
