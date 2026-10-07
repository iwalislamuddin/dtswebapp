// Satu-satunya titik gating Premium di Civil Tools (keputusan pemilik 2026-10-08): tab Detail (laporan perhitungan)
// dan Download Report PDF hanya untuk Edifisia Premium / trial; tab Input & semua perhitungan tetap gratis.
//
// Akun Supabase belum tersambung (Tahap 4 ditunda). Sampai itu: di `npm run dev` dianggap Premium agar tampilan
// bisa dikembangkan & diuji; di build produksi semua pengunjung = Guest (Detail & PDF terkunci).
// Tahap 4: ganti isi usePremium() dengan status platform.premium_status() dari sesi Supabase.

export type PremiumStatus =
  | { premium: true; source: 'dev' | 'account' }
  | { premium: false; reason: 'guest' | 'free' | 'expired' }

const DEV: PremiumStatus = { premium: true, source: 'dev' }
const GUEST: PremiumStatus = { premium: false, reason: 'guest' }

/**
 * Gating Premium aktif? Dimatikan sementara (permintaan pemilik 2026-10-08) agar Detail & PDF bisa ditinjau di
 * semua build. Nyalakan kembali (true) saat akun Supabase tersambung di Tahap 4.
 */
export const PREMIUM_GATE = false

export function premiumStatus(): PremiumStatus {
  if (!PREMIUM_GATE) return DEV
  return import.meta.env.DEV ? DEV : GUEST
}

/** Hook status Premium (kelak reaktif terhadap sesi login). */
export function usePremium(): PremiumStatus {
  return premiumStatus()
}
