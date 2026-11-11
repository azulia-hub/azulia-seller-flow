import { useState, type FormEvent } from 'react'
import { signInShared } from '../adapters/amazon-shared/client'
export function SharedSellerLogin() {
  const [busy,setBusy] = useState(false), [error,setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget)
    setBusy(true); setError('')
    try { await signInShared(String(data.get('email') || ''),String(data.get('password') || '')) }
    catch (cause) {setError(cause instanceof Error ? cause.message : 'Sign-in failed.');setBusy(false)}
  }
  return <section className="hosted-amazon-connection" aria-label="Shared seller sign in"><h2>Sign in to your seller workspace</h2><p>Use the same workspace account on your computer and phone to see the same saved Amazon data.</p><form className="hosted-credential-form" onSubmit={submit}><label>Email<input name="email" type="email" autoComplete="username" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={1024} /></label><button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form>{error ? <p role="alert">{error}</p> : null}<small>Use the owner email and workspace password configured during Netlify setup. Enter Amazon credentials after signing in.</small></section>
}
