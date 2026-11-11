import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { installLogging } from './lib/log'
import { installAnalytics } from './lib/analytics'
import './index.css'

installLogging(import.meta.env.VITE_APP_VERSION ?? '0.1.0')
// Cloudflare Web Analytics (cookieless page views) — no-op when unset.
installAnalytics(import.meta.env.VITE_CF_BEACON_TOKEN)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
