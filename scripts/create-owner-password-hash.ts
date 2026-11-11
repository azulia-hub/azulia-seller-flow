import { createOwnerPasswordHash } from '../server/shared/password.ts'

// Pipe the password over stdin, never through argv, an environment variable or a file.
try {
  if (process.stdin.isTTY) throw new Error('Pipe the password privately via stdin. See docs/shared-seller-setup.md.')
  const chunks: Buffer[] = []; let size = 0
  for await (const value of process.stdin) {
    const chunk = Buffer.from(value); size += chunk.length
    if (size > 4096) throw new Error('Password input is too large.')
    chunks.push(chunk)
  }
  const password = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '')
  console.log(await createOwnerPasswordHash(password))
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : 'Could not generate the workspace password hash.')
  process.exitCode = 1
}
