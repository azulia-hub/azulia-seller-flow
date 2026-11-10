import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

interface InstallPrompt extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome:'accepted' | 'dismissed' }>
}
interface PwaState {
  installed:boolean; busy:boolean; offline:boolean; error:string | null; updateReady:boolean
  install:() => void; update:() => void
}
const PwaContext = createContext<PwaState>({ installed:false, busy:false, offline:false, error:null, updateReady:false, install:() => {}, update:() => {} })
export const usePwa = () => useContext(PwaContext)

export function PwaProvider({ children }: { children:ReactNode }) {
  const [installed,setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?:boolean }).standalone))
  const [busy,setBusy] = useState(false)
  const [offline,setOffline] = useState(!navigator.onLine)
  const [help,setHelp] = useState(false)
  const [error,setError] = useState<string | null>(null)
  const [updateReady,setUpdateReady] = useState(false)
  const prompt = useRef<InstallPrompt | null>(null)
  const registration = useRef<ServiceWorkerRegistration | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const updating = useRef(false)
  useEffect(() => {
    const onPrompt = (event:Event) => { event.preventDefault(); prompt.current = event as InstallPrompt }
    const onInstalled = () => { prompt.current = null; setInstalled(true); setHelp(false) }
    const onNetwork = () => setOffline(!navigator.onLine)
    window.addEventListener('beforeinstallprompt',onPrompt)
    window.addEventListener('appinstalled',onInstalled)
    window.addEventListener('online',onNetwork); window.addEventListener('offline',onNetwork)
    return () => {
      window.removeEventListener('beforeinstallprompt',onPrompt); window.removeEventListener('appinstalled',onInstalled)
      window.removeEventListener('online',onNetwork); window.removeEventListener('offline',onNetwork)
    }
  }, [])
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return
    let disposed = false
    let installing:ServiceWorker | null = null
    const stateChanged = () => { if (!disposed && installing?.state === 'installed' && navigator.serviceWorker.controller) { installing.postMessage({ type:'ACTIVATE_UPDATE' }); setUpdateReady(true) } }
    const updateFound = () => { installing?.removeEventListener('statechange',stateChanged); installing = registration.current?.installing ?? null; installing?.addEventListener('statechange',stateChanged) }
    let hasController = Boolean(navigator.serviceWorker.controller)
    let reloading = false
    const changed = () => {
      if (hasController && !reloading) {
        reloading = true
        window.location.reload()
      }
      hasController = true
    }
    navigator.serviceWorker.addEventListener('controllerchange',changed)
    const checkUpdate = () => { registration.current?.update().catch(() => {}) }
    window.addEventListener('focus', checkUpdate)
    const onVisibility = () => { if (document.visibilityState === 'visible') checkUpdate() }
    document.addEventListener('visibilitychange', onVisibility)
    const updateInterval = setInterval(checkUpdate, 30000)
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope:import.meta.env.BASE_URL, updateViaCache:'none' }).then(result => {
      if (disposed) return
      registration.current = result
      if (result.waiting) { result.waiting.postMessage({ type:'ACTIVATE_UPDATE' }); setUpdateReady(true) }
      result.addEventListener('updatefound',updateFound)
      updateFound()
    }).catch(() => { if (!disposed) setError('Offline setup could not finish. Reopen online to retry; your saved reports are unchanged.') })
    return () => {
      disposed = true
      installing?.removeEventListener('statechange',stateChanged)
      registration.current?.removeEventListener('updatefound',updateFound)
      navigator.serviceWorker.removeEventListener('controllerchange',changed)
      window.removeEventListener('focus', checkUpdate)
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(updateInterval)
    }
  }, [])
  useEffect(() => { if (help && dialog.current && !dialog.current.open) dialog.current.showModal() }, [help])
  const install = async () => {
    setError(null)
    const event = prompt.current
    if (!event) { setHelp(true); return }
    setBusy(true)
    try { await event.prompt(); await event.userChoice; prompt.current = null } catch { setError('The install prompt could not open. Try the browser’s install menu.'); setHelp(true) } finally { setBusy(false) }
  }
  const update = () => {
    const worker = registration.current?.waiting
    if (worker) { updating.current = true; worker.postMessage({ type:'ACTIVATE_UPDATE' }) }
  }
  return <PwaContext.Provider value={{ installed,busy,offline,error,updateReady,install,update }}>{children}
    {help ? <dialog ref={dialog} className="install-dialog" aria-labelledby="install-title" onCancel={() => setHelp(false)} onClose={() => setHelp(false)}><img src={`${import.meta.env.BASE_URL}brand/app-192.png`} width="72" height="72" alt="Azulia app icon" /><h2 id="install-title">Install Azulia</h2><p>Keep Azulia on your desktop or home screen and open it in its own app window.</p><ol><li><strong>Desktop or Android:</strong> open your browser menu and choose Install app or Add to home screen. Chrome and Edge support the direct install prompt.</li><li><strong>iPhone or iPad:</strong> open this site in Safari, choose Share, then Add to Home Screen.</li></ol>{!window.isSecureContext ? <p>Open the HTTPS version of this site to enable installation.</p> : null}<small>Reports stay on this device and browser profile. Installation does not sync data between devices.</small><button className="primary" onClick={() => setHelp(false)}>Done</button></dialog> : null}
  </PwaContext.Provider>
}

export function InstallButton({ className = 'secondary' }: { className?:string }) {
  const pwa = usePwa()
  return <button className={className} disabled={pwa.installed || pwa.busy} onClick={pwa.install}>{pwa.installed ? 'Azulia installed' : pwa.busy ? 'Opening installer…' : 'Install Azulia'}</button>
}
export function InstallCard() {
  return <section className="panel install-card"><img src={`${import.meta.env.BASE_URL}brand/app-192.png`} width="64" height="64" alt="Azulia app icon" /><div><h3>Azulia on your device</h3><p>Install for a dedicated app window and offline access after the app has downloaded. Reports remain local to this device.</p><InstallButton /></div></section>
}
export function PwaStatus() {
  const pwa = usePwa()
  return <>{pwa.offline ? <p className="pwa-notice" role="status">You’re offline. You can use reports already saved in this browser.</p> : null}{pwa.error ? <p className="pwa-notice" role="status">{pwa.error}</p> : null}{pwa.updateReady ? <div className="pwa-notice" role="status"><span>A new version is ready. Save any edits before updating.</span><button className="secondary" onClick={pwa.update}>Update and reload</button></div> : null}</>
}
