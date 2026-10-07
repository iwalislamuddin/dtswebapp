import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

// App baru (React) berakar di web/ karena index.html di akar repo masih milik build lama (zero-build) sampai
// pembersihan Tahap 5. Kode tetap di src/; hasil build ke dist/ (sama dengan scripts/cf-build.sh — dipakai bergantian).
export default defineConfig({
  root: 'web',
  build: { outDir: '../dist', emptyOutDir: true },
  // /src/... (entry di web/index.html) menunjuk ke src/ di akar repo, bukan web/src.
  resolve: { alias: [{ find: /^\/src\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) }] },
  plugins: [
    react(),
    // Pola EDFS Matrix: shell ter-cache, tanpa runtime caching (Supabase selalu ke jaringan); versi baru menunggu
    // pengguna menekan "Perbarui" di menu bar (UpdatePrompt).
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeManifestIcons: false,
      manifest: {
        id: '/',
        name: 'EDFS Civil Tools',
        short_name: 'Civil Tools',
        description: 'EDFS Civil Tools — alat bantu rekayasa sipil sesuai SNI',
        lang: 'id',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#566246',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: process.env.PORT ? { port: Number(process.env.PORT), strictPort: true } : undefined,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
})
