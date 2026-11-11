export const sharedDelivery = import.meta.env.VITE_AZULIA_DELIVERY === 'shared'
const endpoint = import.meta.env.VITE_AZULIA_SHARED_ENDPOINT || '/.netlify/functions/shared'
const sessionKey = 'azulia.shared-session.v2'
interface LoginSession { access_token: string; refresh_token: string; expires_at: number }
let refreshing: Promise<LoginSession> | null = null
function saved(): LoginSession | null {
  try { return JSON.parse(sessionStorage.getItem(sessionKey) || 'null') as LoginSession | null } catch { return null }
}
export function sharedSignedIn() { return Boolean(saved()?.refresh_token) }
export async function signOutShared() {
  try { await sharedRequest('logout') }
  catch { /* Local sign-out still works if the server is unreachable; its session expires. */ }
  finally { sessionStorage.removeItem(sessionKey); location.reload() }
}
async function send(action: string, body: Record<string, unknown>, token?: string, signal?: AbortSignal) {
  const response = await fetch(endpoint, { method:'POST', cache:'no-store', credentials:'omit', redirect:'error', signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(55000)]) : AbortSignal.timeout(55000), headers: {'Content-Type':'application/json','X-Azulia-Intent':'shared-account', ...(token ? {Authorization:`Bearer ${token}`} : {})}, body:JSON.stringify({action,...body}) })
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Shared backend is unavailable. Check the endpoint and deployment configuration.')
  const value = await response.json()
  if (!response.ok) throw Object.assign(new Error(value.error || 'Shared account request failed.'),{status:response.status,retryAfter:value.retryAfter})
  return value
}
async function storeSession(value: LoginSession) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value.access_token) || !/^[A-Za-z0-9_-]{43}$/.test(value.refresh_token) || !Number.isFinite(value.expires_at)) throw new Error('The workspace returned an invalid login session.')
  const session = {access_token:value.access_token,refresh_token:value.refresh_token,expires_at:value.expires_at}
  sessionStorage.setItem(sessionKey,JSON.stringify(session)); return session
}
export async function signInShared(email: string, password: string) { await storeSession(await send('login',{email,password})); location.reload() }
export async function sharedRequest<T>(action: string, body: Record<string,unknown> = {}, signal?: AbortSignal): Promise<T> {
  let session = saved()
  if (!session) throw new Error('Sign in to your shared seller account first.')
  if (session.expires_at * 1000 < Date.now() + 60000) {
    refreshing ??= send('refresh',{refreshToken:session.refresh_token}).then(storeSession).finally(() => {refreshing=null})
    session = await refreshing
  }
  return send(action,body,session.access_token,signal) as Promise<T>
}
