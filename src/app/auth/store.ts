import { create } from 'zustand'
import { useUi } from '../ui-state'
import { AUTH_ENV, authMode, loginUrl } from './config'
import type { PremiumInfo } from './label'
import type { Supabase } from './supabase'

// Sesi akun Edifisia (Supabase Auth, database dipilih .env.<mode>). supabase-js dimuat malas saat initAuth() agar
// muat pertama tetap ringan; status Premium dibaca dari platform.premium_status() (RLS: hanya milik sendiri).

export interface AuthState {
  /** off = .env tidak lengkap (fitur akun disembunyikan); loading = sesi tersimpan sedang dibaca. */
  status: 'off' | 'loading' | 'guest' | 'user'
  userId: string | null
  email: string | null
  /** null selama dibaca / bila gagal dibaca. */
  premium: PremiumInfo | null
}

export const useAuth = create<AuthState>(() => ({
  status: AUTH_ENV ? 'loading' : 'off',
  userId: null,
  email: null,
  premium: null,
}))

let client: Promise<Supabase> | null = null
let premiumReadAt = 0
/** Status Premium dibaca ulang paling sering sekali semenit (saat tab kembali aktif). */
const PREMIUM_STALE_MS = 60_000

function getClient(): Promise<Supabase> {
  if (!AUTH_ENV) return Promise.reject(new Error('Akun Edifisia belum dikonfigurasi (.env)'))
  client ??= import('./supabase').then((m) => m.createClient(AUTH_ENV!))
  return client
}

async function readPremium(sb: Supabase, userId: string) {
  premiumReadAt = Date.now()
  const { data, error } = await sb.schema('platform').rpc('premium_status')
  // Sesi bisa sudah berganti selama menunggu.
  if (useAuth.getState().userId !== userId) return
  const row = (Array.isArray(data) ? data[0] : data) as PremiumInfo | undefined
  if (error) console.warn('premium_status:', error.message)
  useAuth.setState({ premium: error || !row ? null : row })
}

function applySession(sb: Supabase, user: { id: string; email?: string } | null) {
  const prev = useAuth.getState().userId
  if (!user) {
    useAuth.setState({ status: 'guest', userId: null, email: null, premium: null })
    return
  }
  useAuth.setState({ status: 'user', userId: user.id, email: user.email ?? null })
  if (user.id !== prev) {
    useAuth.setState({ premium: null })
    void readPremium(sb, user.id)
  }
}

let started = false

/** Dipanggil sekali saat aplikasi dimuat (aman dipanggil berulang). */
export function initAuth() {
  if (started || !AUTH_ENV) return
  started = true
  void getClient()
    .then(async (sb) => {
      // Setelah login Google (mode local) URL membawa ?code=: supabase-js menukarnya jadi sesi lalu membersihkan URL.
      const { data } = await sb.auth.getSession()
      applySession(sb, data.session?.user ?? null)
      sb.auth.onAuthStateChange((_event, session) => applySession(sb, session?.user ?? null))
      // Sesi bersama (cookie .edifisia.com) bisa berubah di aplikasi lain; baca ulang saat tab kembali aktif.
      addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return
        void sb.auth.getSession().then(({ data: d }) => {
          const user = d.session?.user ?? null
          applySession(sb, user)
          if (user && Date.now() - premiumReadAt > PREMIUM_STALE_MS) void readPremium(sb, user.id)
        })
      })
    })
    .catch((e: unknown) => {
      console.warn('Akun Edifisia tidak tersedia:', e)
      useAuth.setState({ status: 'guest' })
    })
}

/** Tombol "Masuk": di *.edifisia.com ke pusat akun (redirect), selain itu dialog login lokal. */
export function login() {
  if (!AUTH_ENV) return
  if (authMode(location.hostname) === 'redirect') location.assign(loginUrl(AUTH_ENV.accountUrl, location.href))
  else useUi.getState().openDialog('login')
}

/** Pesan galat login dalam Bahasa Indonesia (dikenali lewat `code`, bukan teks pesan). */
function loginError(e: { code?: string; message: string }): string {
  if (e.code === 'invalid_credentials') return 'Email atau kata sandi salah.'
  if (e.code === 'email_not_confirmed') return 'Email belum dikonfirmasi — buka tautan konfirmasi di kotak masuk Anda.'
  if (e.code === 'over_request_rate_limit' || e.code === 'over_email_send_rate_limit')
    return 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.'
  return e.message
}

/** Login email + sandi (mode local). Mengembalikan pesan galat, atau null bila berhasil. */
export async function signInWithPassword(email: string, password: string): Promise<string | null> {
  try {
    const sb = await getClient()
    const { error } = await sb.auth.signInWithPassword({ email, password })
    return error ? loginError(error) : null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

/** Login Google (mode local): kembali ke halaman ini; URL harus terdaftar di Redirect URLs project Supabase. */
export async function signInWithGoogle(): Promise<string | null> {
  try {
    const sb = await getClient()
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } })
    return error ? loginError(error) : null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

/** Keluar. Sesi bersama: di *.edifisia.com ikut keluar dari semua aplikasi Edifisia (docs/sso.md). */
export async function signOut() {
  const sb = await getClient()
  const { error } = await sb.auth.signOut()
  // Tetap bersihkan tampilan walau token sudah tidak berlaku di server.
  if (error) console.warn('signOut:', error.message)
  applySession(sb, null)
}
