import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'

export interface AdsCredentials {
  clientId: string
  clientSecret?: string
  refreshToken: string
  profileId: string
  sellerId: string
  accountName: string
  accessToken?: string
  expiresAt?: number
}
export function adsCredentialsPath(fallback: string): string {
  return process.env.AZULIA_ADS_CREDENTIALS_FILE || fallback
}
export function validateAdsCredentials(value: unknown): AdsCredentials {
  const input = value as AdsCredentials | null
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || !['clientId', 'refreshToken', 'profileId', 'sellerId', 'accountName'].every(key => typeof (input as unknown as Record<string, unknown>)[key] === 'string')
    || !/^amzn1\.application-oa2-client\.[a-zA-Z0-9-]+$/.test(input.clientId)
    || !/^\d{1,20}$/.test(input.profileId) || !/^[A-Z0-9]{8,32}$/.test(input.sellerId)
    || !input.refreshToken || input.refreshToken.length > 16384
    || (input.clientSecret !== undefined && (typeof input.clientSecret !== 'string' || !input.clientSecret || input.clientSecret.length > 16384))
    || (input.accessToken !== undefined && (typeof input.accessToken !== 'string' || input.accessToken.length > 16384))
    || (input.expiresAt !== undefined && !Number.isFinite(input.expiresAt))) throw new Error('Amazon Ads credentials need setup. Run npm run ads:setup.')
  return input
}
export async function loadAdsCredentials(path: string): Promise<AdsCredentials | null> {
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || info.size > 65536) throw new Error()
    return validateAdsCredentials(JSON.parse(await readFile(path, 'utf8')))
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new Error('Cannot load private Amazon Ads credentials. Use npm run ads:setup; file permissions must be 600.')
  }
}
export async function saveAdsCredentials(path: string, value: AdsCredentials): Promise<void> {
  validateAdsCredentials(value)
  const directory = dirname(path)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) throw new Error('Ads credential directory must have mode 700. Choose a private Linux directory.')
  const temporary = join(directory, `${randomUUID()}.json`)
  try {
    const handle = await open(temporary, 'wx', 0o600)
    try { await handle.writeFile(JSON.stringify(value)); await handle.sync() } finally { await handle.close() }
    const saved = await lstat(temporary)
    if ((saved.mode & 0o077) !== 0) throw new Error('Ads credential filesystem cannot enforce private permissions.')
    await rename(temporary, path)
  } finally { await unlink(temporary).catch(() => {}) }
}
export function defaultAdsCredentialsPath(): string {
  return adsCredentialsPath(join(homedir(), '.config', 'azulia', 'amazon-ads-credentials.json'))
}
