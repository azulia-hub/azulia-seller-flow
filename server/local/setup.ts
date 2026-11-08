import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { mkdir, writeFile, rename, lstat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Run setup in your own interactive terminal. Do not pipe credentials or put them in command arguments.')
  process.exitCode = 1
} else {
  const output = new Writable({ write(_chunk, _encoding, done) { done() } })
  const terminal = createInterface({ input: process.stdin, output, terminal: true })
  try {
    const values: Record<string, string> = {}
    for (const [key, label] of [['AMAZON_SP_CLIENT_ID', 'LWA client ID'], ['AMAZON_SP_CLIENT_SECRET', 'LWA client secret'], ['AMAZON_SP_REFRESH_TOKEN', 'India refresh token']]) {
      process.stdout.write(`${label} (hidden): `)
      const answer = (await terminal.question('')).trim()
      process.stdout.write('\n')
      if (!answer || answer.length > 8192) throw new Error()
      values[key] = answer
    }
    const directory = fileURLToPath(new URL('../../.local/', import.meta.url))
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const stat = await lstat(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new Error()
    const temporary = `${directory}/${randomUUID()}.json`
    await writeFile(temporary, JSON.stringify(values), { mode: 0o600, flag: 'wx' })
    await rename(temporary, `${directory}/amazon-credentials.json`)
    console.log('Saved locally with owner-only permissions. Credentials are not encrypted at rest; protect your computer and backups. Restart Azulia to use them.')
  } catch {
    console.error('Setup was not completed. Use nonempty values and ensure .local is private (mode 700).')
    process.exitCode = 1
  } finally { terminal.close() }
}
