// Satu-satunya titik gating Premium di Civil Tools (keputusan pemilik 2026-10-08, dinyalakan 2026-10-17): tab Detail
// (laporan perhitungan), Download Report PDF, dan kelak Simpan Pekerjaan hanya untuk Edifisia Premium / trial; tab
// Input & semua perhitungan tetap gratis. Status dari sesi akun Edifisia (src/app/auth/store.ts →
// platform.premium_status()). Trial 7 hari diberikan trigger platform saat email akun baru terkonfirmasi (sama dengan
// EDFS Matrix) — Civil Tools hanya membaca statusnya.

import { useAuth, type AuthState } from './auth/store'

export type PremiumStatus =
  | { premium: true; source: 'dev' | 'account' }
  | { premium: false; reason: 'loading' | 'guest' | 'free' | 'expired' }

const OPEN: PremiumStatus = { premium: true, source: 'dev' }
const ACCOUNT: PremiumStatus = { premium: true, source: 'account' }
const LOADING: PremiumStatus = { premium: false, reason: 'loading' }
const GUEST: PremiumStatus = { premium: false, reason: 'guest' }
const FREE: PremiumStatus = { premium: false, reason: 'free' }
const EXPIRED: PremiumStatus = { premium: false, reason: 'expired' }

/**
 * Gating Premium aktif? Sempat dimatikan (2026-10-08) untuk tinjauan format; dinyalakan 2026-10-17 setelah login
 * berjalan. `npm run dev` juga mengikuti akun (database dev; akun uji di-grant lewat platform.grant_premium) — set
 * false sementara bila perlu meninjau Detail/PDF tanpa akun Premium.
 */
export const PREMIUM_GATE: boolean = true

function fromAuth(a: Pick<AuthState, 'status' | 'premium'>): PremiumStatus {
  if (!PREMIUM_GATE) return OPEN
  if (a.status === 'loading') return LOADING
  if (a.status !== 'user') return GUEST
  // premium null = status sedang dibaca (atau gagal dibaca): tetap terkunci, tanpa pesan "trial berakhir".
  if (!a.premium) return LOADING
  if (a.premium.active) return ACCOUNT
  return a.premium.expires_at ? EXPIRED : FREE
}

export function premiumStatus(): PremiumStatus {
  return fromAuth(useAuth.getState())
}

/** Hook status Premium (reaktif terhadap login/logout dan pembaruan status Premium). */
export function usePremium(): PremiumStatus {
  return useAuth(fromAuth)
}
