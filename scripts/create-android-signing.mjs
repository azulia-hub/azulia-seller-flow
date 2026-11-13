import { mkdir, access, chmod, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const directory = new URL('../.local/android-signing/', import.meta.url)
const configuration = new URL('signing.json', directory), keystore = new URL('release.jks', directory)
for (const file of [configuration, keystore]) {
  try { await access(file); throw new Error('Signing files already exist. Keep the original key; do not regenerate it.') }
  catch (cause) { if (cause.code !== 'ENOENT') throw cause }
}
await mkdir(directory, { recursive: true, mode: 0o700 })
const password = randomBytes(32).toString('base64url'), alias = 'azulia-release'
const result = spawnSync('keytool', ['-genkeypair', '-keystore', fileURLToPath(keystore), '-storetype', 'PKCS12', '-alias', alias, '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=Azulia Seller', '-storepass:env', 'AZULIA_SIGNING_PASSWORD', '-keypass:env', 'AZULIA_SIGNING_PASSWORD', '-noprompt'], { env: { ...process.env, AZULIA_SIGNING_PASSWORD: password }, stdio: 'ignore' })
if (result.status !== 0) throw new Error('Could not create signing key. Check that the JDK keytool is installed; existing files were retained.')
await chmod(keystore, 0o600)
await writeFile(configuration, JSON.stringify({ keystore: fileURLToPath(keystore), password, alias }), { mode: 0o600, flag: 'wx' })
console.log('Private signing files created under .local/android-signing/. Back up this entire folder securely; keep the same key for every APK update.')
