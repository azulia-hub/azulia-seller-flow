import { BrandEntrance } from '../components/BrandEntrance'
import { useEffect, useState, type ReactNode } from 'react'
import { appNavigation, type AppPage } from './navigation'

type Theme = 'dark' | 'light' | 'system'
function storedTheme(): Theme { try { const value = localStorage.getItem('azulia-theme'); return value === 'dark' || value === 'system' ? value : 'light' } catch { return 'light' } }

type Props = {
  readonly search?: ReactNode
  readonly active: AppPage
  readonly mobileNavOpen: boolean
  readonly reportName: string
  readonly reportLoaded: boolean
  readonly onNavigate: (page: AppPage) => void
  readonly onToggleMobileNav: () => void
  readonly children: ReactNode
}

export function AppShell({ active, search, mobileNavOpen, onToggleMobileNav, reportName, reportLoaded, onNavigate, children }: Props) {
  const [theme, setTheme] = useState<Theme>(storedTheme)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolved
      document.documentElement.style.colorScheme = resolved
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#191816' : '#f7f5ef')
    }
    apply()
    media.addEventListener('change', apply)
    try { localStorage.setItem('azulia-theme', theme) } catch { /* Theme still works for this session. */ }
    return () => media.removeEventListener('change', apply)
  }, [theme])
  const page = appNavigation.find(item => item.page === active)
  return <div className="app-shell seller-workspace"><BrandEntrance />
    {mobileNavOpen ? <button className="workspace-nav-scrim" aria-label="Close navigation" onClick={onToggleMobileNav} /> : null}
    <aside className={`workspace-sidebar ${mobileNavOpen ? 'is-open' : ''}`}>
      <button className="workspace-brand" onClick={() => onNavigate('Home')}><img className="workspace-logo" src={`${import.meta.env.BASE_URL}brand/azulia-logo.webp`} alt="Azulia" width="96" height="96" /><small>Seller workspace</small></button>
      <nav aria-label="Main navigation">{(['Analytics','Workspace'] as const).map(group => <div className="workspace-nav-group" key={group}><small>{group}</small>{appNavigation.filter(item => item.group === group).map(item => <button key={item.page} aria-current={active === item.page ? 'page' : undefined} className={active === item.page ? 'active' : ''} onClick={() => onNavigate(item.page)}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}</div>)}</nav>
      <div className="workspace-privacy"><span aria-hidden="true">◉</span><div><strong>Local &amp; private</strong><small>Your reports stay in this browser.</small></div></div>
    </aside>
    <main className="app-main">
      <header className="topbar workspace-topbar">
        <div className="workspace-topbar-title"><button className="workspace-menu secondary" aria-label="Open navigation" aria-expanded={mobileNavOpen} onClick={onToggleMobileNav}>☰</button><img className="mobile-brand-logo" src={`${import.meta.env.BASE_URL}brand/azulia-logo.webp`} alt="Azulia" width="32" height="32" /><span>{page?.label ?? 'Dashboard'}</span></div>
        <div className="workspace-search-slot">{search}</div>
        <div className="topbar-actions"><select className="theme-toggle" aria-label="Appearance" value={theme} onChange={event => setTheme(event.target.value as Theme)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select><button className={`current-report ${reportLoaded ? 'ready' : ''}`} onClick={() => onNavigate('Reports')} title={reportLoaded ? reportName : 'Upload a report'}><span className="report-indicator" /><span><small>{reportLoaded ? 'Active report' : 'Get started'}</small><strong>{reportLoaded ? reportName : 'Upload a report'}</strong></span><b>Change</b></button></div>
      </header>
      <div className="content">{children}</div>
      <footer className="app-disclosure"><strong>Private by design</strong><span>Reports and costs stay in this browser. Profit depends on source classifications and product-cost coverage.</span></footer>
    </main>
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">{appNavigation.filter(item => item.bottom).map(item => <button key={item.page} className={active === item.page ? 'active' : ''} aria-current={active === item.page ? 'page' : undefined} onClick={() => onNavigate(item.page)}><span aria-hidden="true">{item.icon}</span><small>{item.mobileLabel ?? item.label}</small></button>)}</nav>
  </div>
}
