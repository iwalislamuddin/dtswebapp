import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './ui/kit.css'
import './app/ui-state' // pasang tema sebelum render pertama
import App from './App.tsx'
import { initPixel } from './app/pixel'

initPixel() // Meta Pixel (hanya produksi tools.edifisia.com) — sebelum render agar pindah rute pertama ikut terlacak

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
