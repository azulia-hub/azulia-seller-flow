import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const format = /^scrypt-v1\$([a-f0-9]{32})\$([a-f0-9]{64})$/
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error); else resolve(key)
    })
  })
}
export const validOwnerPasswordHash = (value: string) => format.test(value)
export async function createOwnerPasswordHash(password: string): Promise<string> {
  if (password.length < 12 || password.length > 1024) throw new Error('Use a workspace password between 12 and 1024 characters.')
  const salt = randomBytes(16), key = await derive(password, salt)
  return `scrypt-v1$${salt.toString('hex')}$${key.toString('hex')}`
}
export async function verifyOwnerPassword(password: string, encoded: string): Promise<boolean> {
  const match = format.exec(encoded)
  if (!match || password.length > 1024) return false
  const actual = await derive(password, Buffer.from(match[1], 'hex'))
  return timingSafeEqual(actual, Buffer.from(match[2], 'hex'))
}
