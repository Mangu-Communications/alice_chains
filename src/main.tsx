import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import App from './App.tsx'
import { applyTheme, resolveTheme, THEME_STORAGE_KEY } from "@/lib/theme"

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
