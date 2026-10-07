import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './app/ui-state' // pasang tema sebelum render pertama
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
