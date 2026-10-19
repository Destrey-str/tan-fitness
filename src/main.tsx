import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import App from './App.tsx'
import './index.css'

try {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateSW(true)
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const tick = () => {
        registration.update().catch(() => undefined)
      }
      tick()
      window.setInterval(tick, 5 * 60 * 1000)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') tick()
      })
    },
    onOfflineReady() {
      try {
        localStorage.setItem('jianzhi-offline-ready', '1')
      } catch {
        /* ignore */
      }
    },
  })
} catch {
  /* iOS private mode / missing SW — app must still boot */
}

const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}
