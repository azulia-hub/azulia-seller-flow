import { lstat, readFile } from 'node:fs/promises'
import { type PilotCredentials } from '../amazon/pilot.ts'

export async function loadCredentials(path: string): Promise<PilotCredentials> {
  try {
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || stat.size > 32768) throw new Error()
    const value: unknown = JSON.parse(await readFile(path, 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    const record = value as Record<string, unknown>
    const result: PilotCredentials = {}
    for (const name of ['AMAZON_SP_CLIENT_ID', 'AMAZON_SP_CLIENT_SECRET', 'AMAZON_SP_REFRESH_TOKEN'] as const) {
      if (typeof record[name] !== 'string' || !record[name].trim()) throw new Error()
      result[name] = record[name]
    }
    return result
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw new Error('Cannot load private credentials. Run npm run local:setup; ensure the file is private (mode 600).')
  }
}
