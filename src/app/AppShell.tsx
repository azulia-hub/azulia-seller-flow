import { useEffect, useState, type ReactNode } from 'react'
import { appNavigation, type AppPage } from './navigation'

type Theme = 'dark' | 'light'
function storedTheme(): Theme { try { return localStorage.getItem('azulia-theme') === 'light' ? 'light' : 'dark' } catch { return 'dark' } }

type Props = {
  readonly active: AppPage
  readonly mobileNavOpen: boolean
  readonly reportName: string
  readonly reportLoaded: boolean
  readonly onNavigate: (page: AppPage) => void
  readonly onToggleMobileNav: () => void
  readonly children: ReactNode
}

export function AppShell({ active, reportName, reportLoaded, onNavigate, children }: Props) {
  const [theme, setTheme] = useState<Theme>(storedTheme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    try { localStorage.setItem('azulia-theme', theme) } catch { /* Theme still works for this session. */ }
  }, [theme])
  return <div className="app-shell">
    <main className="app-main">
      <header className="topbar">
        <button className="top-brand" onClick={() => onNavigate('Home')}><span className="brand-mark">A</span><span><strong>Azulia Seller Flow</strong><small>Know your real profit</small></span></button>
        <nav className="desktop-top-nav" aria-label="Main navigation">{appNavigation.map(item => <button key={item.page} className={active === item.page ? 'active' : ''} onClick={() => onNavigate(item.page)}>{item.label}</button>)}</nav>
        <div className="topbar-actions"><button className="theme-toggle" type="button" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} aria-pressed={theme === 'light'} title={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')}><span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span><small>{theme === 'dark' ? 'Light' : 'Dark'}</small></button><button className={`current-report ${reportLoaded ? 'ready' : ''}`} onClick={() => onNavigate('Reports')}><span className="report-indicator" /><span><small>{reportLoaded ? 'Current report' : 'No report loaded'}</small><strong>{reportLoaded ? reportName : 'Upload a report'}</strong></span><b>Change</b></button></div>
      </header>
      <div className="content">{children}</div>
      <footer className="app-disclosure"><strong>Private by design</strong><span>Reports and costs stay in this browser. Profit is an analytical estimate and depends on source classification and product-cost coverage.</span></footer>
    </main>
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">{appNavigation.map((item) => <button key={item.page} className={active === item.page ? 'active' : ''} onClick={() => onNavigate(item.page)}><span>{item.icon}</span><small>{item.mobileLabel ?? item.label}</small></button>)}</nav>
  </div>
}
