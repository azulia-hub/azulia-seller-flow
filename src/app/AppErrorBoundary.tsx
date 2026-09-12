import { Component, type ErrorInfo, type ReactNode } from 'react'

export class AppErrorBoundary extends Component<{ readonly children: ReactNode }, { readonly failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Azulia Seller Flow could not render safely.', error, info) }
  render() {
    if (!this.state.failed) return this.props.children
    return <main className="fatal-error"><div><span className="brand-mark">A</span><h1>Azulia Seller Flow needs to restart</h1><p>Your locally saved reports and product costs have not been deleted. Reload the app first; if the problem continues, restore a recent backup from Data & Settings.</p><button className="primary" onClick={() => window.location.reload()}>Reload Azulia Seller Flow</button></div></main>
  }
}
