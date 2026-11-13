export interface PilotCredentials {
  AMAZON_SP_CLIENT_ID?: string
  AMAZON_SP_CLIENT_SECRET?: string
  AMAZON_SP_REFRESH_TOKEN?: string
}

export function pilotCredentialsConfigured(env: PilotCredentials): boolean {
  return [env.AMAZON_SP_CLIENT_ID, env.AMAZON_SP_CLIENT_SECRET, env.AMAZON_SP_REFRESH_TOKEN]
    .every(value => Boolean(value?.trim()))
}

/** Credential exchange helper. Never log credentials or tokens. Local mode keeps tokens server-side; the stateless hosted relay returns only the caller-owned access token to that caller’s temporary browser session. */
export class TokenExchangeError extends Error {
  readonly retryAfter: number
  readonly status: number
  constructor(message: string, retryAfter: number, status = 0) { super(message); this.retryAfter = retryAfter; this.status = status }
}
export async function requirePilotAccessToken(env: PilotCredentials, request: typeof fetch): Promise<string> {
  try {
    const response = await request('https://api.amazon.com/auth/o2/token', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token', client_id: env.AMAZON_SP_CLIENT_ID!,
        client_secret: env.AMAZON_SP_CLIENT_SECRET!, refresh_token: env.AMAZON_SP_REFRESH_TOKEN!,
      }),
    })
    if (!response.ok) {
      await response.body?.cancel()
      if ([400,401,403].includes(response.status)) throw new TokenExchangeError('Amazon rejected the saved app credentials or seller authorization. Open local connection settings to reconnect.', 900, 401)
      throw new TokenExchangeError(response.status === 429 ? 'Amazon token requests are rate limited. Retrying shortly; saved results remain available.' : 'Amazon authorization service is temporarily unavailable. Retrying; saved results remain available.', 60, response.status)
    }
    // The fixed LWA endpoint has a small token response. Bound parsing anyway.
    const reader = response.body?.getReader()
    if (!reader) throw new TokenExchangeError('Amazon returned no authorization response. Retrying shortly.', 60)
    let size = 0
    const chunks: Uint8Array[] = []
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 32768) throw new TokenExchangeError('Amazon authorization response exceeds the expected size.', 300)
        chunks.push(value)
      }
    } finally {
      await reader.cancel()
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (!body || typeof body !== 'object') throw new TokenExchangeError('Amazon returned an unsupported authorization response.', 300)
    const token = body as Record<string, unknown>
    const valid = typeof token.access_token === 'string' && token.access_token.length > 0
      && typeof token.token_type === 'string' && token.token_type.toLowerCase() === 'bearer'
      && typeof token.expires_in === 'number' && Number.isFinite(token.expires_in) && token.expires_in > 0
    if (!valid) throw new TokenExchangeError('Amazon returned an unsupported authorization response. Saved credentials were not changed.', 300)
    return token.access_token as string
  } catch (cause) {
    if (cause instanceof TokenExchangeError) throw cause
    throw new TokenExchangeError('Cannot reach Amazon authorization service. Check the computer’s internet connection; saved results remain available and sync will retry.', 60)
  }
}

export async function getPilotAccessToken(env: PilotCredentials, request: typeof fetch): Promise<string | null> {
  try { return await requirePilotAccessToken(env, request) } catch { return null }
}

/** Verify only the LWA exchange; this does not prove Orders/Finances permissions. */
export async function checkPilotCredentials(env: PilotCredentials, request: typeof fetch): Promise<boolean> {
  return Boolean(await getPilotAccessToken(env, request))
}
