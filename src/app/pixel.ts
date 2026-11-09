import { PIXEL_HOST, PIXEL_ID } from './appInfo'

// Meta Pixel (docs/meta-pixel.md, salinan panduan repo edifisia-platform). Aturan:
// - hanya build produksi di tools.edifisia.com (dev, *.pages.dev, localhost tidak dilacak);
// - Pixel baru dimuat setelah URL bersih (query hanya utm_*, fbclid, next; hash tanpa `=`), menunggu maks. 10 detik;
// - autoConfig mati, tanpa advanced matching / data akun / isi pekerjaan di parameter event;
// - PageView setiap pindah rute SPA (pushState/replaceState/popstate), AppOpen sekali per sesi peramban,
//   Lead saat pengguna menekan "Beli Premium" (trackLead).
// Tidak ada CSP di aplikasi ini; service worker (Workbox) tidak punya runtime caching sehingga permintaan ke
// connect.facebook.net / www.facebook.com selalu lewat jaringan.

type Fbq = (...args: unknown[]) => void

/** Lingkungan peramban yang dipakai Pixel — diinjeksi agar logika bisa diuji tanpa DOM (pixel.test.ts). */
export interface PixelEnv {
  location: Pick<Location, 'hostname' | 'pathname' | 'search' | 'hash'>
  history: Pick<History, 'pushState' | 'replaceState'>
  addEventListener: (type: 'popstate', fn: () => void) => void
  session: Pick<Storage, 'getItem' | 'setItem'> | null
  /** Memasang snippet fbq + skrip fbevents.js; mengembalikan fbq. */
  load: () => Fbq
  setTimeout: (fn: () => void, ms: number) => unknown
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (id: unknown) => void
}

export const APP = 'civil-tools'
const SAFE_PARAM = /^(utm_\w+|fbclid|next)$/
const OPEN_KEY = 'edfs-px-open'
const POLL_MS = 250
const POLL_TRIES = 40 // 40 × 250 ms = 10 detik

/** URL boleh dikirim ke Meta? (dl = URL lengkap) */
export function isCleanUrl(search: string, hash: string): boolean {
  if (hash.includes('=')) return false
  for (const k of new URLSearchParams(search).keys()) if (!SAFE_PARAM.test(k)) return false
  return true
}

let fbq: Fbq | null = null

/**
 * Pasang Pixel. Dipanggil sekali di main.tsx sebelum render pertama (agar pembungkus history aktif sebelum router
 * memakainya). Mengembalikan false bila Pixel tidak dipakai di lingkungan ini.
 */
export function setupPixel(env: PixelEnv, opts: { enabled: boolean }): boolean {
  if (!opts.enabled || env.location.hostname !== PIXEL_HOST) return false

  const loc = env.location
  const clean = () => isCleanUrl(loc.search, loc.hash)
  let started = false
  let lastPath = ''

  const pageView = () => {
    if (!started || !fbq || !clean() || loc.pathname === lastPath) return
    lastPath = loc.pathname
    fbq('track', 'PageView')
  }

  const start = () => {
    fbq = env.load()
    fbq('set', 'autoConfig', false, PIXEL_ID)
    fbq('init', PIXEL_ID)
    started = true
    pageView()
    try {
      if (env.session && !env.session.getItem(OPEN_KEY)) {
        env.session.setItem(OPEN_KEY, '1')
        fbq('trackCustom', 'AppOpen', { app: APP })
      }
    } catch {
      // sessionStorage diblokir: lewati AppOpen
    }
  }

  // SPA: PageView tiap pindah rute. replaceState ikut dibungkus agar PageView pertama terkirim setelah URL dibersihkan.
  for (const m of ['pushState', 'replaceState'] as const) {
    const orig = env.history[m]
    env.history[m] = function (this: History, ...args: Parameters<History['pushState']>) {
      const r = orig.apply(this, args)
      env.setTimeout(pageView, 0)
      return r
    }
  }
  env.addEventListener('popstate', pageView)

  if (clean()) start()
  else {
    let tries = 0
    const timer = env.setInterval(() => {
      if (clean()) {
        env.clearInterval(timer)
        start()
      } else if (++tries >= POLL_TRIES) env.clearInterval(timer)
    }, POLL_MS)
  }
  return true
}

/** Lead: pengguna menekan "Beli Premium" (sebelum ke halaman harga). Tanpa Pixel tidak melakukan apa-apa. */
export function trackLead() {
  fbq?.('track', 'Lead', { content_name: 'premium', app: APP })
}

/** Snippet resmi Meta (fbevents.js), ditulis ulang tanpa variabel global selain fbq/_fbq yang dibutuhkannya. */
function loadFbevents(): Fbq {
  type Stub = Fbq & { callMethod?: Fbq; queue: unknown[]; push: Stub; loaded: boolean; version: string }
  const w = window as unknown as { fbq?: Stub; _fbq?: Stub }
  if (w.fbq) return w.fbq
  const n = function (...args: unknown[]) {
    if (n.callMethod) n.callMethod(...args)
    else n.queue.push(args)
  } as Stub
  n.push = n
  n.loaded = true
  n.version = '2.0'
  n.queue = []
  w.fbq = n
  w._fbq ??= n
  const s = document.createElement('script')
  s.async = true
  s.src = 'https://connect.facebook.net/en_US/fbevents.js'
  document.head.append(s)
  return n
}

function sessionOrNull(): Storage | null {
  try {
    return sessionStorage
  } catch {
    return null
  }
}

/** Pemasangan nyata di peramban. */
export function initPixel() {
  setupPixel(
    {
      location,
      history,
      addEventListener: (t, f) => addEventListener(t, f),
      session: sessionOrNull(),
      load: loadFbevents,
      setTimeout: (f, ms) => setTimeout(f, ms),
      setInterval: (f, ms) => setInterval(f, ms),
      clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
    },
    { enabled: import.meta.env.PROD },
  )
}
