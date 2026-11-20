import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { lstat, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defaultAdsCredentialsPath, saveAdsCredentials } from './credentials.ts'

const args = process.argv.slice(2)
const argument = (name: string) => args[args.indexOf(name) + 1]
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Run setup in your own interactive terminal. Do not put secrets in arguments.')
  process.exitCode = 1
} else {
  const output = new Writable({ write(_chunk, _encoding, done) { done() } })
  const terminal = createInterface({ input: process.stdin, output, terminal: true })
  try {
    const source = resolve(args.includes('--tokens') ? argument('--tokens') : 'tokens.json')
    const stat = await lstat(source)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536 || (stat.mode & 0o077) !== 0) throw new Error()
    const tokens = JSON.parse(await readFile(source, 'utf8'))
    process.stdout.write('Amazon Ads Client Secret (hidden): ')
    const clientSecret = (await terminal.question('')).trim()
    process.stdout.write('\n')
    await saveAdsCredentials(defaultAdsCredentialsPath(), {
      clientId: tokens.client_id, refreshToken: tokens.refresh_token, clientSecret,
      profileId: argument('--profile'), sellerId: argument('--seller'), accountName: args.includes('--name') ? argument('--name') : argument('--seller'),
    })
    console.log('Amazon Ads credentials saved privately, separately from SP-API. The running Ads service will load them automatically.')
  } catch {
    console.error('Setup failed. Check the token file, --profile and --seller arguments, and owner-only directory/file permissions. No credentials printed.')
    process.exitCode = 1
  } finally { terminal.close() }
}
