// Konfigurasi akun Edifisia (murni — tanpa supabase-js, bisa di-test). Nilai publik (publishable key memang untuk
// browser); secret/service_role key TIDAK PERNAH masuk repo.

export const ROOT_DOMAIN = 'edifisia.com'

export interface AuthEnv {
  target: 'dev' | 'prod'
  supabaseUrl: string
  publishableKey: string
  /** Pusat akun yang memakai database yang sama (daftar, lupa sandi, /akun, login redirect). */
  accountUrl: string
}

const ENVS: Record<AuthEnv['target'], AuthEnv> = {
  dev: {
    target: 'dev',
    supabaseUrl: 'https://djfkyyibydwyplgzexwz.supabase.co', // edifisia-dev, Sydney
    publishableKey: 'sb_publishable_lEIKRrtGZAIB3-1eeTNYYg_I5Ey5JZV',
    accountUrl: 'https://staging.edifisia.com',
  },
  prod: {
    target: 'prod',
    supabaseUrl: 'https://tqxkqxtijubcracpmlav.supabase.co', // edifisia-prod, Singapore
    publishableKey: 'sb_publishable_vZKpECd2_uAwnmtv9ixXZw_Q9rqmGt6',
    accountUrl: 'https://edifisia.com',
  },
}

export const onRootDomain = (host: string) => host === ROOT_DOMAIN || host.endsWith(`.${ROOT_DOMAIN}`)

/**
 * Database dipilih saat berjalan menurut alamat, jadi satu build melayani keduanya:
 * - `tools.edifisia.com` (dan *.edifisia.com lain) → prod;
 * - `*.pages.dev` (Cloudflare Pages — URL development) dan localhost → dev.
 * `VITE_AUTH_TARGET=prod|dev` (mis. di .env.local) memaksa pilihan untuk uji lokal.
 */
export function authTarget(host: string, override?: string): AuthEnv['target'] {
  if (override === 'prod' || override === 'dev') return override
  return onRootDomain(host) ? 'prod' : 'dev'
}

export const authEnvFor = (host: string, override?: string): AuthEnv => ENVS[authTarget(host, override)]

export const AUTH_ENV: AuthEnv | null =
  typeof location === 'undefined' ? null : authEnvFor(location.hostname, import.meta.env.VITE_AUTH_TARGET)

/**
 * Cara login di host ini:
 * - `redirect` — di *.edifisia.com. Site URL & Redirect URLs Supabase menunjuk edifisia.com, jadi login (termasuk
 *   Google) dikerjakan pusat akun: `<akun>/masuk?next=<halaman ini>`. Sesi kembali lewat cookie `.edifisia.com`
 *   (SSO, docs/sso.md di repo edifisia-platform).
 * - `local` — localhost / IP LAN / *.pages.dev: cookie `.edifisia.com` tidak terbaca di sini, jadi login lewat dialog
 *   sendiri (email + sandi, Google dengan `redirectTo` ke halaman ini; harus terdaftar di Redirect URLs project dev).
 *   Sesi ini terpisah dari edifisia.com / staging.edifisia.com.
 */
export type AuthMode = 'redirect' | 'local'
export const authMode = (host: string): AuthMode => (onRootDomain(host) ? 'redirect' : 'local')

/** Domain cookie sesi — harus sama dengan semua aplikasi Edifisia (docs/sso.md). Di luar edifisia.com host-only. */
export const cookieDomain = (host: string) => (onRootDomain(host) ? `.${ROOT_DOMAIN}` : undefined)

/** Halaman login pusat akun dengan `?next=` (hanya diterima pusat akun bila https di *.edifisia.com). */
export const loginUrl = (accountUrl: string, next: string) => `${accountUrl}/masuk?next=${encodeURIComponent(next)}`
export const registerUrl = (accountUrl: string) => `${accountUrl}/daftar`
export const forgotUrl = (accountUrl: string) => `${accountUrl}/lupa-sandi`
export const accountPageUrl = (accountUrl: string) => `${accountUrl}/akun`
