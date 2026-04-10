import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster 
      position="bottom-right"
      toastOptions={{
        style: {
          background: '#14181D',
          color: '#F4F6FA',
          border: '1px solid rgba(255,255,255,0.1)',
        },
      }}
    />
  </StrictMode>,
)
