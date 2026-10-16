// Satu-satunya titik gating Premium di Civil Tools (keputusan pemilik 2026-10-08): tab Detail (laporan perhitungan)
// dan Download Report PDF hanya untuk Edifisia Premium / trial; tab Input & semua perhitungan tetap gratis.
// Status dari sesi akun Edifisia (src/app/auth/store.ts → platform.premium_status()).

import { useAuth, type AuthState } from './auth/store'

export type PremiumStatus =
  | { premium: true; source: 'dev' | 'account' }
  | { premium: false; reason: 'guest' | 'free' | 'expired' }

const OPEN: PremiumStatus = { premium: true, source: 'dev' }
const ACCOUNT: PremiumStatus = { premium: true, source: 'account' }
const GUEST: PremiumStatus = { premium: false, reason: 'guest' }
const FREE: PremiumStatus = { premium: false, reason: 'free' }
const EXPIRED: PremiumStatus = { premium: false, reason: 'expired' }

/**
 * Gating Premium aktif? Dimatikan sementara (permintaan pemilik 2026-10-08) agar Detail & PDF bisa ditinjau di
 * semua build. Nyalakan (true) setelah login diuji dengan akun sungguhan — wajib sebelum rilis v0.8.0. Saat menyala,
 * `npm run dev` juga mengikuti akun (database dev; akun uji di-grant lewat platform.grant_premium).
 */
export const PREMIUM_GATE = false

function fromAuth(a: Pick<AuthState, 'status' | 'premium'>): PremiumStatus {
  if (!PREMIUM_GATE) return OPEN
  if (a.status !== 'user') return GUEST
  if (a.premium?.active) return ACCOUNT
  return a.premium?.expires_at ? EXPIRED : FREE
}

export function premiumStatus(): PremiumStatus {
  return fromAuth(useAuth.getState())
}

/** Hook status Premium (reaktif terhadap login/logout dan pembaruan status Premium). */
export function usePremium(): PremiumStatus {
  return useAuth(fromAuth)
}
