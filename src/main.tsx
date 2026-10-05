import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import App from './App.tsx'
import { applyTheme, resolveTheme, THEME_STORAGE_KEY } from "@/lib/theme"

// P-PWA-2. Register in production only so the dev server is not stuck behind
// a shell cache. Push still registers the same /sw.js when the member opts in.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js")
  })
}

try {
  applyTheme(resolveTheme(localStorage.getItem(THEME_STORAGE_KEY)), document.documentElement)
} catch {
  applyTheme(resolveTheme(null), document.documentElement)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <TRPCProvider>
        <App />
      </TRPCProvider>
    </BrowserRouter>
  </StrictMode>,
)
