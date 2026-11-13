import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const signing = JSON.parse(await readFile(new URL('../.local/android-signing/signing.json', import.meta.url), 'utf8').catch(() => { throw new Error('Create a permanent signing key first: npm run android:signing') }))
const tools = fileURLToPath(new URL('../.local/android-tools/', import.meta.url))
const env = { ...process.env, AZULIA_KEYSTORE: signing.keystore, AZULIA_STORE_PASSWORD: signing.password, AZULIA_KEY_ALIAS: signing.alias, AZULIA_KEY_PASSWORD: signing.password }
if (existsSync(`${tools}jdk/bin/java`)) env.JAVA_HOME = `${tools}jdk`
if (existsSync(`${tools}sdk/platforms/android-36`)) env.ANDROID_HOME ??= `${tools}sdk`
if (existsSync(tools)) env.GRADLE_USER_HOME ??= `${tools}gradle-cache`
const gradle = existsSync(`${tools}gradle-8.13/bin/gradle`) ? `${tools}gradle-8.13/bin/gradle` : 'gradle'
const result = spawnSync(gradle, ['-p', 'android', ':app:assembleRelease', '--no-daemon'], { stdio: 'inherit', env })
if (result.error || result.status !== 0) { console.error('APK build failed. Install JDK 17, Gradle 8.13 and Android SDK 36; keep the existing signing files.'); process.exitCode = 1 }
