import { PwaProvider } from './adapters/browser/pwa'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { AppErrorBoundary } from './app/AppErrorBoundary'
import './styles/global.css'
import './styles/import-feedback.css'
import './styles/motion.css'
import './styles/theme.css'
import './styles/refinement.css'
import './styles/orderActivity.css'
import './styles/workspace.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><AppErrorBoundary><PwaProvider><App /></PwaProvider></AppErrorBoundary></StrictMode>,
)
