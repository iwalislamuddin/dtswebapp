import { beforeEach, describe, expect, it, vi } from 'vitest'

// Modul pixel menyimpan fbq di level modul → muat ulang tiap test.
async function fresh() {
  vi.resetModules()
  return import('./pixel')
}

function makeEnv(url: string, host = 'tools.edifisia.com') {
  const u = new URL(url, `https://${host}`)
  const loc = { hostname: host, pathname: u.pathname, search: u.search, hash: u.hash }
  const calls: unknown[][] = []
  const store = new Map<string, string>()
  const timers: (() => void)[] = []
  let interval: (() => void) | null = null
  let popstate: (() => void) | null = null
  const setUrl = (to: string) => {
    const n = new URL(to, `https://${host}`)
    Object.assign(loc, { pathname: n.pathname, search: n.search, hash: n.hash })
  }
  const history = {
    pushState: (_s: unknown, _t: string, to?: string | URL | null) => to && setUrl(String(to)),
    replaceState: (_s: unknown, _t: string, to?: string | URL | null) => to && setUrl(String(to)),
  }
  const env = {
    location: loc,
    history,
    addEventListener: (_t: 'popstate', f: () => void) => (popstate = f),
    session: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    load: vi.fn(() => (...a: unknown[]) => void calls.push(a)),
    setTimeout: (f: () => void) => timers.push(f),
    setInterval: (f: () => void) => (interval = f),
    clearInterval: () => (interval = null),
  }
  return {
    env,
    calls,
    store,
    flush: () => timers.splice(0).forEach((f) => f()),
    tick: (n = 1) => {
      for (let i = 0; i < n && interval; i++) interval()
    },
    back: (to: string) => (setUrl(to), popstate?.()),
    events: () => calls.filter((c) => c[0] === 'track' || c[0] === 'trackCustom').map((c) => c[1]),
  }
}

describe('isCleanUrl', () => {
  it('menerima utm_*, fbclid, next dan hash rute', async () => {
    const { isCleanUrl } = await fresh()
    expect(isCleanUrl('', '')).toBe(true)
    expect(isCleanUrl('?utm_source=ig&utm_campaign=x&fbclid=abc&next=%2Fa', '#bagian')).toBe(true)
  })
  it('menolak parameter lain dan hash berisi =', async () => {
    const { isCleanUrl } = await fresh()
    expect(isCleanUrl('?code=abc', '')).toBe(false)
    expect(isCleanUrl('?utm_source=a&email=x', '')).toBe(false)
    expect(isCleanUrl('', '#access_token=xyz')).toBe(false)
  })
})

describe('setupPixel', () => {
  let px: Awaited<ReturnType<typeof fresh>>
  beforeEach(async () => {
    px = await fresh()
  })

  it('tidak aktif di luar produksi atau di host lain', () => {
    const a = makeEnv('/')
    expect(px.setupPixel(a.env, { enabled: false })).toBe(false)
    const b = makeEnv('/', 'dtswebapp.pages.dev')
    expect(px.setupPixel(b.env, { enabled: true })).toBe(false)
    const c = makeEnv('/', 'localhost')
    expect(px.setupPixel(c.env, { enabled: true })).toBe(false)
    expect(a.env.load).not.toHaveBeenCalled()
    expect(b.env.load).not.toHaveBeenCalled()
    expect(c.env.load).not.toHaveBeenCalled()
  })

  it('autoConfig mati sebelum init, tanpa data pribadi; PageView + AppOpen', () => {
    const t = makeEnv('/balok-baja?utm_source=ig')
    px.setupPixel(t.env, { enabled: true })
    expect(t.calls[0]).toEqual(['set', 'autoConfig', false, '1250093348350553'])
    expect(t.calls[1]).toEqual(['init', '1250093348350553']) // tanpa argumen advanced matching
    expect(t.calls.slice(2)).toEqual([
      ['track', 'PageView'],
      ['trackCustom', 'AppOpen', { app: 'civil-tools' }],
    ])
  })

  it('PageView sekali per rute SPA (push, replace, popstate), tanpa ganda', () => {
    const t = makeEnv('/')
    px.setupPixel(t.env, { enabled: true })
    t.env.history.pushState(null, '', '/kombinasi-beban')
    t.flush()
    t.env.history.replaceState(null, '', '/kombinasi-beban') // path sama → tidak dikirim lagi
    t.flush()
    t.back('/')
    expect(t.events()).toEqual(['PageView', 'AppOpen', 'PageView', 'PageView'])
  })

  it('menunggu URL bersih (?code=) lalu menyala setelah replaceState', () => {
    const t = makeEnv('/?code=abc')
    px.setupPixel(t.env, { enabled: true })
    t.tick(3)
    expect(t.env.load).not.toHaveBeenCalled()
    t.env.history.replaceState(null, '', '/')
    t.flush() // pembungkus history: belum mulai → tidak mengirim apa-apa
    expect(t.calls).toEqual([])
    t.tick()
    expect(t.env.load).toHaveBeenCalledOnce()
    expect(t.events()).toEqual(['PageView', 'AppOpen'])
  })

  it('menyerah setelah ±10 detik bila URL tetap kotor', () => {
    const t = makeEnv('/#access_token=xyz')
    px.setupPixel(t.env, { enabled: true })
    t.tick(40)
    t.back('/')
    t.tick(5)
    expect(t.env.load).not.toHaveBeenCalled()
  })

  it('AppOpen hanya sekali per sesi', async () => {
    const t = makeEnv('/')
    px.setupPixel(t.env, { enabled: true })
    const again = await fresh()
    const u = makeEnv('/')
    u.store.set('edfs-px-open', '1')
    again.setupPixel(u.env, { enabled: true })
    expect(t.events()).toContain('AppOpen')
    expect(u.events()).toEqual(['PageView'])
  })

  it('Lead hanya bila Pixel aktif', () => {
    px.trackLead() // belum aktif → diam
    const t = makeEnv('/')
    px.setupPixel(t.env, { enabled: true })
    px.trackLead()
    expect(t.calls.at(-1)).toEqual(['track', 'Lead', { content_name: 'premium', app: 'civil-tools' }])
  })
})
