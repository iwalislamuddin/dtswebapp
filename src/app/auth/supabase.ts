import { createBrowserClient } from '@supabase/ssr'
import type { AuthEnv } from './config'
import { cookieDomain } from './config'

/**
 * Klien Supabase browser (dimuat malas oleh store.ts agar supabase-js tidak membebani muat pertama). Sesi disimpan
 * sebagai cookie — konfigurasi HARUS sama dengan web/src/lib/supabase.ts di repo edifisia-platform dan Matrix
 * (docs/sso.md), supaya satu login berlaku di semua aplikasi *.edifisia.com. Di localhost cookie host-only.
 */
export function createClient(env: AuthEnv) {
  return createBrowserClient(env.supabaseUrl, env.publishableKey, {
    cookieOptions: {
      domain: cookieDomain(location.hostname),
      path: '/',
      sameSite: 'lax',
      secure: location.protocol === 'https:',
    },
  })
}

export type Supabase = ReturnType<typeof createClient>
