import { cp, mkdir, rm, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
// Copy only public production output, never .local or environment/credential files.
const source = new URL('../dist/', import.meta.url)
const target = new URL('../android/app/src/main/assets/web/', import.meta.url)
await access(new URL('index.html', source))
await access(new URL('device-bridge.json', source))
await mkdir(new URL('../android/app/src/main/assets/', import.meta.url), { recursive: true })
await rm(target, { recursive: true, force: true })
await cp(source, target, { recursive: true })
console.log(`Bundled frontend prepared: ${fileURLToPath(target)}`)
