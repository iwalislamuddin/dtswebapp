import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }
import { prerenderPages, sitemapXml } from './src/app/seo.ts'
import { TOOLS } from './src/tools.ts'

const BUILD_DATE = new Date().toISOString().slice(0, 10)

/**
 * SEO: index.html hasil build disalin per rute dengan <head> & isi statis masing-masing (src/app/seo.ts), plus
 * 404.html dan sitemap.xml. Cloudflare Pages menyajikan `<id>.html` di `/<id>` dan 404.html untuk path lain.
 */
function prerender(): Plugin {
  return {
    name: 'civil-tools:prerender',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const index = bundle['index.html']
      if (!index || index.type !== 'asset') throw new Error('prerender: index.html tidak ada di bundle')
      for (const p of prerenderPages(String(index.source))) {
        if (p.fileName === 'index.html') index.source = p.html
        else this.emitFile({ type: 'asset', fileName: p.fileName, source: p.html })
      }
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml(BUILD_DATE) })
    },
  }
}

// App baru (React) berakar di web/ karena index.html di akar repo masih milik build lama (zero-build) sampai
// pembersihan Tahap 5. Kode tetap di src/; hasil build ke dist/ (sama dengan scripts/cf-build.sh — dipakai bergantian).
export default defineConfig({
  root: 'web',
  // chunk pdf-lib (lazy, hanya saat unduh PDF) memang ±1,1 MB
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  // /src/... (entry di web/index.html) menunjuk ke src/ di akar repo, bukan web/src.
  resolve: { alias: [{ find: /^\/src\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) }] },
  plugins: [
    react(),
    prerender(),
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
        // Halaman pre-render hanya untuk crawler/muat pertama; offline cukup index.html (SPA).
        // + pembangun PDF (pdf-lib, ±1 MB) & font: dimuat saat tombol PDF ditekan, tidak perlu di-precache.
        globIgnores: ['404.html', ...TOOLS.map((t) => `${t.id}.html`), 'assets/pdf-*.js'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: process.env.PORT ? { port: Number(process.env.PORT), strictPort: true } : undefined,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(BUILD_DATE),
  },
})
