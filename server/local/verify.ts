import { fileURLToPath } from 'node:url'
import { loadCredentials } from './credentials.ts'
import { pilotCredentialsConfigured } from '../amazon/pilot.ts'
import { checkPilotPermissions } from '../amazon/permissions.ts'

try {
  const credentials = await loadCredentials(fileURLToPath(new URL('../../.local/amazon-credentials.json', import.meta.url)))
  if (!pilotCredentialsConfigured(credentials)) throw new Error()
  const result = await checkPilotPermissions(credentials)
  console.log(JSON.stringify(result, null, 2))
  if (result.orders.status !== 'verified' || result.finances.status !== 'verified') process.exitCode = 1
} catch {
  console.error('Verification could not complete. Check local credential setup and network access. No credential values are included in this message.')
  process.exitCode = 1
}
